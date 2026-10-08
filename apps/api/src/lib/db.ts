import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

export const MIGRATIONS_DIR = join(import.meta.dirname, "../../../../db/migrations");

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  return db;
}

/**
 * db/migrations の SQL を番号順に適用する。適用済みのものは schema_migrations で管理する。
 * テーブルの作り直しに対応するため、適用中は外部キー制約を外し、最後に整合性を確認する。
 */
export function migrate(db: Db, dir = MIGRATIONS_DIR): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at_ms INTEGER NOT NULL)",
  );
  const applied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((r) => String(r.name)),
  );
  const pending = readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f) && !applied.has(f))
    .sort();

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    for (const name of pending) {
      db.exec("BEGIN");
      try {
        db.exec(readFileSync(join(dir, name), "utf8"));
        db.prepare("INSERT INTO schema_migrations (name, applied_at_ms) VALUES (?, ?)").run(
          name,
          Date.now(),
        );
        const violations = db.prepare("PRAGMA foreign_key_check").all();
        if (violations.length > 0) {
          throw new Error(`foreign key violations after ${name}: ${JSON.stringify(violations)}`);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
  return pending;
}
