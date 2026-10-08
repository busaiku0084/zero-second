//! SQLite の読み書き。API と同じファイルを共有する（ADR 0004）。
//!
//! rusqlite は同期 API なので、短いクエリだけをここに置き、購入の最中には呼ばない（ADR 0011）。

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use anyhow::{Context, anyhow, bail};
use rusqlite::{Connection, OptionalExtension, params};

use crate::metrics::RequestTiming;
use crate::model::{Reservation, ReservationStatus, RunFinish};

/// ワーカーが前提にするマイグレーション（これ以降が適用済みであること）
const REQUIRED_MIGRATION: &str = "0002_manual_mode.sql";

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        let conn = Connection::open(path)
            .with_context(|| format!("DB を開けません: {}", path.display()))?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> anyhow::Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> anyhow::Result<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn conn(&self) -> anyhow::Result<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| anyhow!("DB の接続を取得できません"))
    }

    /// マイグレーションは API が適用する。ワーカーは適用済みかだけを確認する
    pub fn ensure_migrated(&self) -> anyhow::Result<()> {
        let conn = self.conn()?;
        let applied: Option<String> = conn
            .query_row(
                "SELECT name FROM schema_migrations WHERE name = ?",
                [REQUIRED_MIGRATION],
                |r| r.get(0),
            )
            .optional()
            .context(
                "schema_migrations を読めません。先に make dev-api で API を起動してください",
            )?;
        if applied.is_none() {
            bail!(
                "マイグレーション {REQUIRED_MIGRATION} が未適用です。先に make dev-api で API を起動してください"
            );
        }
        Ok(())
    }

    /// 前回のワーカーが途中で止まり、preparing / running のまま残った自動購入の予約を failed にする
    pub fn recover_stale(&self) -> anyhow::Result<usize> {
        let now = crate::clock::now_ms();
        let conn = self.conn()?;
        let n = conn.execute(
            "UPDATE reservations SET status = 'failed', updated_at_ms = ?
             WHERE mode = 'auto' AND status IN ('preparing', 'running')",
            [now],
        )?;
        Ok(n)
    }

    /// 準備を始める時刻を過ぎた、自動購入の待機中の予約
    pub fn due_reservations(&self, now_ms: i64, lead_ms: i64) -> anyhow::Result<Vec<Reservation>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, account_id, site, title, event_url, ticket_type, quantity, payment_method,
                    sale_starts_at_ms
             FROM reservations
             WHERE mode = 'auto' AND status = 'pending' AND sale_starts_at_ms - ? <= ?
             ORDER BY sale_starts_at_ms",
        )?;
        let rows = stmt
            .query_map(params![lead_ms, now_ms], |r| {
                Ok(Reservation {
                    id: r.get(0)?,
                    account_id: r.get(1)?,
                    site: r.get(2)?,
                    title: r.get(3)?,
                    event_url: r.get(4)?,
                    ticket_type: r.get(5)?,
                    quantity: r.get(6)?,
                    payment_method: r.get(7)?,
                    sale_starts_at_ms: r.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// pending → preparing。更新できた（= このワーカーが取った）ときだけ true
    pub fn claim(&self, reservation_id: i64) -> anyhow::Result<bool> {
        let conn = self.conn()?;
        let n = conn.execute(
            "UPDATE reservations SET status = 'preparing', updated_at_ms = ?
             WHERE id = ? AND status = 'pending'",
            params![crate::clock::now_ms(), reservation_id],
        )?;
        Ok(n == 1)
    }

    pub fn set_status(&self, reservation_id: i64, status: ReservationStatus) -> anyhow::Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE reservations SET status = ?, updated_at_ms = ? WHERE id = ?",
            params![status.as_str(), crate::clock::now_ms(), reservation_id],
        )?;
        Ok(())
    }

    pub fn create_run(&self, reservation_id: i64, started_at_ms: i64) -> anyhow::Result<i64> {
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO runs (reservation_id, mode, started_at_ms) VALUES (?, 'auto', ?)",
            params![reservation_id, started_at_ms],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// 実行の結果・計測値・予約の状態をまとめて保存する
    pub fn finish_run(
        &self,
        reservation_id: i64,
        run_id: i64,
        finish: &RunFinish,
        timings: &[RequestTiming],
    ) -> anyhow::Result<()> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let outcome = finish.outcome.as_ref();
        tx.execute(
            "UPDATE runs SET finished_at_ms = ?, result = ?, clock_offset_ms = ?, error = ?,
                             order_id = ?, payment_reference = ?, payment_due_at_ms = ?
             WHERE id = ?",
            params![
                finish.finished_at_ms,
                finish.result.as_str(),
                finish.clock_offset_ms,
                finish.error,
                outcome.map(|o| o.order_id.as_str()),
                outcome.and_then(|o| o.payment_reference.as_deref()),
                outcome.and_then(|o| o.payment_due_at_ms),
                run_id,
            ],
        )?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO timings (run_id, phase, method, url, status, started_at_ms, duration_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )?;
            for t in timings {
                stmt.execute(params![
                    run_id,
                    t.phase.as_str(),
                    t.method,
                    t.url,
                    t.status,
                    t.started_at_ms,
                    t.duration_ms,
                ])?;
            }
        }
        tx.execute(
            "UPDATE reservations SET status = ?, updated_at_ms = ? WHERE id = ?",
            params![
                finish.result.reservation_status().as_str(),
                crate::clock::now_ms(),
                reservation_id
            ],
        )?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
pub mod testing {
    //! テスト用: インメモリ DB に db/migrations を当てる
    use super::*;

    pub fn migrated_db() -> Db {
        let db = Db::open_in_memory().unwrap();
        {
            let conn = db.conn().unwrap();
            let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../db/migrations");
            let mut files: Vec<_> = std::fs::read_dir(&dir)
                .unwrap()
                .map(|e| e.unwrap().path())
                .filter(|p| p.extension().is_some_and(|e| e == "sql"))
                .collect();
            files.sort();
            conn.execute_batch(
                "PRAGMA foreign_keys = OFF;
                 CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at_ms INTEGER NOT NULL);",
            )
            .unwrap();
            for f in files {
                conn.execute_batch(&std::fs::read_to_string(&f).unwrap())
                    .unwrap();
                let name = f.file_name().unwrap().to_string_lossy().to_string();
                conn.execute("INSERT INTO schema_migrations VALUES (?, 0)", [name])
                    .unwrap();
            }
            conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        }
        db
    }

    /// 予約を 1 件入れて id を返す
    pub fn insert_reservation(db: &Db, site: &str, mode: &str, sale_starts_at_ms: i64) -> i64 {
        let conn = db.conn().unwrap();
        conn.execute(
            "INSERT INTO reservations (site, title, event_url, ticket_type, quantity, payment_method,
                                       sale_starts_at_ms, mode, status, created_at_ms, updated_at_ms)
             VALUES (?, 'テスト公演', 'http://localhost/mock', '一般', 1, 'convenience_store', ?, ?, 'pending', 0, 0)",
            params![site, sale_starts_at_ms, mode],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    pub fn status_of(db: &Db, reservation_id: i64) -> String {
        db.conn()
            .unwrap()
            .query_row(
                "SELECT status FROM reservations WHERE id = ?",
                [reservation_id],
                |r| r.get(0),
            )
            .unwrap()
    }

    pub fn last_run(db: &Db, reservation_id: i64) -> (String, Option<String>, i64) {
        db.conn()
            .unwrap()
            .query_row(
                "SELECT result, error, (SELECT COUNT(*) FROM timings WHERE run_id = runs.id)
                 FROM runs WHERE reservation_id = ? ORDER BY id DESC LIMIT 1",
                [reservation_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;

    #[test]
    fn starts_when_migrated() {
        let db = migrated_db();
        db.ensure_migrated().unwrap();
    }

    #[test]
    fn picks_only_due_auto_reservations() {
        let db = migrated_db();
        let now = 1_000_000;
        let due = insert_reservation(&db, "mock", "auto", now + 60_000);
        insert_reservation(&db, "mock", "auto", now + 600_000); // まだ早い
        insert_reservation(&db, "ticketdive", "manual", now); // 手動
        let got = db.due_reservations(now, 120_000).unwrap();
        assert_eq!(got.iter().map(|r| r.id).collect::<Vec<_>>(), vec![due]);
    }

    #[test]
    fn claims_a_reservation_only_once() {
        let db = migrated_db();
        let id = insert_reservation(&db, "mock", "auto", 0);
        assert!(db.claim(id).unwrap());
        assert!(!db.claim(id).unwrap());
        assert_eq!(status_of(&db, id), "preparing");
    }

    #[test]
    fn recovers_stale_reservations() {
        let db = migrated_db();
        let id = insert_reservation(&db, "mock", "auto", 0);
        db.claim(id).unwrap();
        assert_eq!(db.recover_stale().unwrap(), 1);
        assert_eq!(status_of(&db, id), "failed");
    }
}
