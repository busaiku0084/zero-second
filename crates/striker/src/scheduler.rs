//! 予約のポーリング（ADR 0011）。準備を始める時刻を過ぎた自動購入の予約を取り、1 件ずつタスクで実行する。

use std::sync::Arc;

use tokio::task::JoinSet;

use crate::clock::now_ms;
use crate::config::Config;
use crate::db::Db;
use crate::executor;
use crate::model::{ReservationStatus, RunFinish, RunResult};
use crate::sites::SiteRegistry;

pub struct Scheduler {
    db: Arc<Db>,
    config: Config,
    sites: Arc<SiteRegistry>,
}

impl Scheduler {
    pub fn new(db: Arc<Db>, config: Config, sites: SiteRegistry) -> Self {
        Self {
            db,
            config,
            sites: Arc::new(sites),
        }
    }

    /// Ctrl+C を受けるまで動く。止めるときは実行中の購入が終わるのを待つ
    pub async fn run(self) -> anyhow::Result<()> {
        let mut tasks = JoinSet::new();
        let mut ticker = tokio::time::interval(self.config.poll_interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        tracing::info!(
            poll_ms = self.config.poll_interval.as_millis() as u64,
            lead_ms = self.config.lead.as_millis() as u64,
            "予約の監視を始めます"
        );

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    if let Err(e) = self.poll(&mut tasks) {
                        tracing::error!(error = %format!("{e:#}"), "予約を確認できませんでした");
                    }
                }
                Some(joined) = tasks.join_next() => {
                    if let Err(e) = joined.map_err(anyhow::Error::from).and_then(|r| r.map(|_| ())) {
                        tracing::error!(error = %format!("{e:#}"), "実行中にエラーが起きました");
                    }
                }
                _ = tokio::signal::ctrl_c() => {
                    tracing::info!(running = tasks.len(), "停止します。実行中の購入が終わるのを待ちます");
                    while tasks.join_next().await.is_some() {}
                    return Ok(());
                }
            }
        }
    }

    fn poll(&self, tasks: &mut JoinSet<anyhow::Result<RunResult>>) -> anyhow::Result<()> {
        let lead_ms = self.config.lead.as_millis() as i64;
        for reservation in self.db.due_reservations(now_ms(), lead_ms)? {
            if !self.db.claim(reservation.id)? {
                continue;
            }
            let Some(site) = self.sites.find(&reservation.site) else {
                // 規約で自動化が禁止されたサイトなど、アダプタのない予約は動かさない（ADR 0005）
                tracing::warn!(reservation_id = reservation.id, site = %reservation.site, "未対応のサイトです");
                let run_id = self.db.create_run(reservation.id, now_ms())?;
                self.db.finish_run(
                    reservation.id,
                    run_id,
                    &RunFinish {
                        result: RunResult::Failed,
                        finished_at_ms: now_ms(),
                        clock_offset_ms: None,
                        error: Some(format!(
                            "自動購入に対応していないサイトです: {}",
                            reservation.site
                        )),
                        outcome: None,
                    },
                    &[],
                )?;
                continue;
            };

            tracing::info!(reservation_id = reservation.id, site = site.id(), title = %reservation.title, "準備を始めます");
            let db = Arc::clone(&self.db);
            let policy = site.retry_policy();
            let key = self.config.credential_key.clone();
            tasks.spawn(async move {
                let id = reservation.id;
                let result =
                    executor::execute(&db, site.as_ref(), reservation, &policy, key.as_ref()).await;
                if result.is_err() {
                    // 保存にも失敗した場合、予約が preparing / running のまま残らないようにする
                    let _ = db.set_status(id, ReservationStatus::Failed);
                }
                result
            });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::db::testing::*;
    use crate::sites::fake::FakeSite;

    /// "mock" に、HTTP を使わない FakeSite を登録したスケジューラ
    fn scheduler(db: Arc<Db>) -> Scheduler {
        let mut config = Config::from_lookup(|_| None).unwrap();
        config.poll_interval = Duration::from_millis(10);
        config.lead = Duration::from_secs(60);
        let mut sites = SiteRegistry::default();
        sites
            .register(Arc::new(FakeSite {
                id: "mock",
                ..FakeSite::default()
            }))
            .unwrap();
        Scheduler::new(db, config, sites)
    }

    #[tokio::test]
    async fn unsupported_site_is_failed_without_running() {
        let db = Arc::new(migrated_db());
        // API を通さずに DB へ直接入れた、自動化が禁止されたサイトの auto 予約
        let id = insert_reservation(&db, "ticketdive", "auto", now_ms());
        let mut tasks = JoinSet::new();
        scheduler(Arc::clone(&db)).poll(&mut tasks).unwrap();
        assert!(tasks.is_empty());
        assert_eq!(status_of(&db, id), "failed");
        assert!(
            last_run(&db, id)
                .1
                .unwrap()
                .contains("対応していないサイト")
        );
    }

    #[tokio::test]
    async fn supported_reservation_runs_to_completion() {
        let db = Arc::new(migrated_db());
        let id = insert_reservation(&db, "mock", "auto", now_ms() + 20);
        let mut tasks = JoinSet::new();
        scheduler(Arc::clone(&db)).poll(&mut tasks).unwrap();
        assert_eq!(tasks.len(), 1);
        let result = tasks.join_next().await.unwrap().unwrap().unwrap();
        assert_eq!(result, RunResult::Succeeded);
        assert_eq!(status_of(&db, id), "succeeded");
    }
}
