-- 購入補助（手動購入）に対応する
-- - reservations: アカウントを任意にし、title / mode / notes を追加
--   SQLite は既存列の NOT NULL を外せないため、データを保ったままテーブルを作り直す
-- - runs: mode / notes を追加

CREATE TABLE reservations_new (
  id                INTEGER PRIMARY KEY,
  account_id        INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  site              TEXT    NOT NULL,
  title             TEXT    NOT NULL DEFAULT '',
  event_url         TEXT    NOT NULL,
  ticket_type       TEXT    NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  payment_method    TEXT    NOT NULL,
  sale_starts_at_ms INTEGER NOT NULL,
  -- manual: 手で購入する（購入補助のみ） / auto: striker が購入する
  mode              TEXT    NOT NULL DEFAULT 'manual',
  notes             TEXT    NOT NULL DEFAULT '',
  -- pending / preparing / running / succeeded / failed / needs_human / cancelled
  status            TEXT    NOT NULL DEFAULT 'pending',
  created_at_ms     INTEGER NOT NULL,
  updated_at_ms     INTEGER NOT NULL
);

INSERT INTO reservations_new (
  id, account_id, site, event_url, ticket_type, quantity, payment_method,
  sale_starts_at_ms, mode, status, created_at_ms, updated_at_ms
)
SELECT
  id, account_id, site, event_url, ticket_type, quantity, payment_method,
  sale_starts_at_ms, 'auto', status, created_at_ms, updated_at_ms
FROM reservations;

DROP INDEX reservations_status_sale_starts_at;
DROP TABLE reservations;
ALTER TABLE reservations_new RENAME TO reservations;
CREATE INDEX reservations_status_sale_starts_at ON reservations (status, sale_starts_at_ms);

ALTER TABLE runs ADD COLUMN mode  TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE runs ADD COLUMN notes TEXT NOT NULL DEFAULT '';
CREATE INDEX runs_reservation_id ON runs (reservation_id);
