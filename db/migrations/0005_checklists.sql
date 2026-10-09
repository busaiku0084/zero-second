-- 購入前チェックリスト（#13）
-- 予約ごとの確認項目。予約を作るときにサイトのテンプレートから入れ、あとから足したり消したりできる

CREATE TABLE checklist_items (
  id             INTEGER PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
  label          TEXT    NOT NULL,
  position       INTEGER NOT NULL,
  -- 済ませた時刻。NULL なら未チェック
  done_at_ms     INTEGER,
  created_at_ms  INTEGER NOT NULL
);

CREATE INDEX checklist_items_reservation_id ON checklist_items (reservation_id, position);
