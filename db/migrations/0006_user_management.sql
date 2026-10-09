-- ユーザー管理（ADR 0020）
-- - users.disabled_at_ms: 停止した時刻。停止中はログインできず、自動購入・通知も止める
-- - password_resets: 管理者が発行するパスワードの再設定リンク（トークンはハッシュだけ保存）

ALTER TABLE users ADD COLUMN disabled_at_ms INTEGER;

CREATE TABLE password_resets (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    TEXT    NOT NULL UNIQUE,
  -- 発行した管理者。サーバーのコマンドで発行したときは NULL
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  used_at_ms    INTEGER
);
