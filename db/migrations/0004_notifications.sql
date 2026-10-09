-- 通知（ADR 0017）
-- - reservations.reminder_minutes: 販売開始の何分前に知らせるか（JSON の配列。例: [30, 5]）
-- - runs.notified_at_ms: 自動購入の結果を通知した時刻。既存の行は通知済みとして扱う
-- - notifications: アプリ内の通知（送信履歴を兼ねる）
-- - push_subscriptions: ブラウザ通知（Web Push）の購読
-- - notification_settings: ユーザーごとの Webhook（Discord / Slack）

ALTER TABLE reservations ADD COLUMN reminder_minutes TEXT NOT NULL DEFAULT '[30,5]';

ALTER TABLE runs ADD COLUMN notified_at_ms INTEGER;
UPDATE runs SET notified_at_ms = COALESCE(finished_at_ms, started_at_ms) WHERE result IS NOT NULL;

CREATE TABLE notifications (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reservation_id INTEGER REFERENCES reservations (id) ON DELETE SET NULL,
  -- reminder / needs_human / succeeded / failed / test
  kind           TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  body           TEXT    NOT NULL DEFAULT '',
  -- 開く画面（/reservations/1 など、web の中のパス）
  url            TEXT    NOT NULL DEFAULT '/',
  -- 同じ通知を二度作らないためのキー（例: reminder:12:1760000000000:5）
  dedupe_key     TEXT    NOT NULL,
  -- 各経路の送信結果: sent / failed / skipped（経路を設定していない）
  push_status    TEXT,
  webhook_status TEXT,
  created_at_ms  INTEGER NOT NULL,
  read_at_ms     INTEGER,
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX notifications_user_id ON notifications (user_id, created_at_ms);

CREATE TABLE push_subscriptions (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint      TEXT    NOT NULL UNIQUE,
  p256dh        TEXT    NOT NULL,
  auth          TEXT    NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE notification_settings (
  user_id               INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- Webhook の URL は秘密の値なので、ログイン情報と同じ鍵で暗号化して保存する（ADR 0008）
  encrypted_webhook_url BLOB,
  -- discord / slack（URL から判定。表示用）
  webhook_kind          TEXT,
  updated_at_ms         INTEGER NOT NULL
);
