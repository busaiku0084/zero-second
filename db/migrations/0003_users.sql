-- ログインと複数ユーザー（ADR 0016）
-- - users / sessions / invitations を追加
-- - accounts・reservations に user_id を付ける。既存の行は NULL のまま残し、
--   最初の管理者を作ったときにその人へ引き継ぐ（API の /auth/setup）
-- - accounts の一意制約を (site, login_id) から (user_id, site, login_id) に変えるため作り直す

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  login_id      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  -- scrypt のハッシュ（平文は保存しない）
  password_hash TEXT    NOT NULL,
  -- admin / member
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'member')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE sessions (
  -- トークンそのものは保存せず、SHA-256 のハッシュだけを持つ
  token_hash    TEXT    PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE INDEX sessions_user_id ON sessions (user_id);

CREATE TABLE invitations (
  id             INTEGER PRIMARY KEY,
  token_hash     TEXT    NOT NULL UNIQUE,
  -- 誰向けの招待かのメモ（管理者が見る用）
  note           TEXT    NOT NULL DEFAULT '',
  created_by     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at_ms  INTEGER NOT NULL,
  expires_at_ms  INTEGER NOT NULL,
  accepted_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  accepted_at_ms INTEGER
);

CREATE TABLE accounts_new (
  id                    INTEGER PRIMARY KEY,
  user_id               INTEGER REFERENCES users (id) ON DELETE CASCADE,
  site                  TEXT    NOT NULL,
  login_id              TEXT    NOT NULL,
  encrypted_credentials BLOB    NOT NULL,
  created_at_ms         INTEGER NOT NULL,
  updated_at_ms         INTEGER NOT NULL,
  UNIQUE (user_id, site, login_id)
);

INSERT INTO accounts_new (id, site, login_id, encrypted_credentials, created_at_ms, updated_at_ms)
SELECT id, site, login_id, encrypted_credentials, created_at_ms, updated_at_ms FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;

ALTER TABLE reservations ADD COLUMN user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX reservations_user_id ON reservations (user_id, sale_starts_at_ms);
