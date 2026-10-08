import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, migrate, openDb } from "./db.js";

describe("migrate", () => {
  it("すべて適用し、2 回目は何もしない", () => {
    const db = openDb(":memory:");
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    expect(migrate(db)).toEqual(all.sort());
    expect(migrate(db)).toEqual([]);
  });

  it("0002 は既存の予約と実行結果を保ったまま作り直す", () => {
    // 0001 だけを適用した状態を作る
    const dir = mkdtempSync(join(tmpdir(), "zs-migrations-"));
    const first = "0001_init.sql";
    writeFileSync(join(dir, first), readFileSync(join(MIGRATIONS_DIR, first)));
    const db = openDb(":memory:");
    migrate(db, dir);

    db.exec(`
      INSERT INTO accounts VALUES (1, 'mock', 'me', x'00', 0, 0);
      INSERT INTO reservations VALUES (1, 1, 'mock', 'https://example.com', '一般', 2, 'convenience_store', 100, 'pending', 0, 0);
      INSERT INTO runs (id, reservation_id, started_at_ms) VALUES (1, 1, 100);
    `);

    expect(migrate(db)).toContain("0002_manual_mode.sql");
    const reservation = db.prepare("SELECT * FROM reservations WHERE id = 1").get();
    expect(reservation).toMatchObject({ account_id: 1, quantity: 2, mode: "auto", title: "" });
    expect(db.prepare("SELECT mode FROM runs WHERE id = 1").get()).toMatchObject({ mode: "auto" });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
