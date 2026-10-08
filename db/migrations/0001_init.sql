-- 初期スキーマ（#2 で詰める）
-- 時刻はすべて UNIX ミリ秒（INTEGER）で保存する

CREATE TABLE accounts (
  id                    INTEGER PRIMARY KEY,
  site                  TEXT    NOT NULL,
  login_id              TEXT    NOT NULL,
  -- ログイン情報は平文で保存しない（アプリ側で暗号化した値を入れる）
  encrypted_credentials BLOB    NOT NULL,
  created_at_ms         INTEGER NOT NULL,
  updated_at_ms         INTEGER NOT NULL,
  UNIQUE (site, login_id)
);

CREATE TABLE reservations (
  id                INTEGER PRIMARY KEY,
  account_id        INTEGER NOT NULL REFERENCES accounts (id),
  site              TEXT    NOT NULL,
  event_url         TEXT    NOT NULL,
  ticket_type       TEXT    NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  payment_method    TEXT    NOT NULL,
  sale_starts_at_ms INTEGER NOT NULL,
  -- pending / preparing / running / succeeded / failed / needs_human
  status            TEXT    NOT NULL DEFAULT 'pending',
  created_at_ms     INTEGER NOT NULL,
  updated_at_ms     INTEGER NOT NULL
);

CREATE INDEX reservations_status_sale_starts_at ON reservations (status, sale_starts_at_ms);

CREATE TABLE runs (
  id                  INTEGER PRIMARY KEY,
  reservation_id      INTEGER NOT NULL REFERENCES reservations (id),
  clock_offset_ms     INTEGER,
  started_at_ms       INTEGER NOT NULL,
  finished_at_ms      INTEGER,
  -- succeeded / failed / needs_human
  result              TEXT,
  error               TEXT,
  order_id            TEXT,
  payment_reference   TEXT,
  payment_due_at_ms   INTEGER
);

CREATE TABLE timings (
  id            INTEGER PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES runs (id),
  phase         TEXT    NOT NULL,
  method        TEXT    NOT NULL,
  url           TEXT    NOT NULL,
  status        INTEGER,
  started_at_ms INTEGER NOT NULL,
  duration_ms   REAL    NOT NULL
);

CREATE INDEX timings_run_id ON timings (run_id);
