# データベース

SQLite（WAL モード）。API とワーカーが同じファイルを使う（[ADR 0004](adr/0004-shared-sqlite-without-queue.md)）。
場所は `DATABASE_URL`（既定 `file:./data/zero-second.sqlite`、リポジトリ直下からの相対パス）。

## マイグレーション

- `db/migrations/NNNN_name.sql` を番号順に適用する。適用済みのものは `schema_migrations` に記録される
- API の起動時に自動で適用する。ワーカーは必要なものが適用済みかだけを確認する
- 適用中は外部キー制約を外し、最後に `PRAGMA foreign_key_check` で整合性を確かめる（テーブルを作り直す移行のため）
- 適用済みのファイルは書き換えない。変更は新しいファイルを追加する

## テーブル

時刻はすべて UNIX ミリ秒の INTEGER（[ADR 0007](adr/0007-time-representation.md)）。

### users
zero-second にログインするユーザー（[ADR 0016](adr/0016-login-and-per-user-data.md)）。

| 列 | 内容 |
|---|---|
| `login_id` | ログイン ID。大文字・小文字を区別せず一意 |
| `password_hash` | scrypt のハッシュ（`scrypt$logN$r$p$salt$hash`） |
| `role` | `admin`（招待・ユーザー一覧を扱える）/ `member` |
| `disabled_at_ms` | 停止した時刻。停止中はログイン・自動購入・リマインドが止まる（[ADR 0020](adr/0020-user-management.md)） |

### password_resets
管理者が発行したパスワードの再設定リンク。`token_hash` はトークンの SHA-256。`used_at_ms` が入ったものは使用済み。24 時間で期限切れ。

### sessions
ログイン中のセッション。`token_hash` はトークンの SHA-256（トークンそのものは保存しない）。`expires_at_ms` を過ぎたものは無効で、ログインのたびに消す。

### invitations
招待リンク。`token_hash` はトークンの SHA-256。`accepted_at_ms` が入ったものは使用済み。`note` は管理者用のメモ。

### accounts
サイトごとのログイン情報。

| 列 | 内容 |
|---|---|
| `user_id` | 持ち主のユーザー。ログイン機能より前の行は NULL で、最初の管理者を作ったときに引き継ぐ |
| `site` | サイト ID（`packages/shared/src/sites.json`） |
| `login_id` | ログイン ID。`(user_id, site, login_id)` で一意 |
| `encrypted_credentials` | AES-256-GCM で暗号化したパスワード（[ADR 0008](adr/0008-credential-encryption.md)） |

### reservations
購入したい公演の予約。

| 列 | 内容 |
|---|---|
| `user_id` | 持ち主のユーザー（accounts と同じく、古い行は最初の管理者に引き継ぐ） |
| `account_id` | 使うアカウント（任意。本人のものだけ。アカウント削除時は NULL） |
| `site` / `title` / `event_url` | サイト・公演名・公演ページ |
| `ticket_type` / `quantity` / `payment_method` | 席種・枚数・支払い方法（今は `convenience_store` のみ） |
| `sale_starts_at_ms` | 販売開始時刻 |
| `mode` | `manual`（手で購入）/ `auto`（ワーカーが購入） |
| `status` | 下の状態遷移を参照 |

### checklist_items
購入前チェックリスト（[ADR 0019](adr/0019-checklist-copied-from-template.md)）。`label`・`position`（並び順）・`done_at_ms`（済ませた時刻。NULL は未チェック）。予約を消すと一緒に消える。

### notifications / push_subscriptions / notification_settings
通知（[ADR 0017](adr/0017-notifications.md)）。

| テーブル | 内容 |
|---|---|
| `notifications` | アプリ内の通知と送信履歴。`kind`（reminder / needs_human / succeeded / failed / test）、`url`（開く画面）、`push_status`・`webhook_status`（sent / failed / skipped）、`read_at_ms`。`(user_id, dedupe_key)` で一意 |
| `push_subscriptions` | ブラウザ通知の購読。`endpoint` で一意（同じブラウザで別のユーザーがログインしたら付け替える） |
| `notification_settings` | ユーザーごとの Webhook。URL は暗号化して保存する |

`reservations.reminder_minutes` は通知のタイミング（JSON の配列、分）。`runs.notified_at_ms` は自動購入の結果を通知した時刻。

### runs
購入の実行結果（手動の記録と、ワーカーの実行の両方）。

| 列 | 内容 |
|---|---|
| `mode` | `manual` / `auto` |
| `clock_offset_ms` | サーバー時刻 − 端末の時刻（ワーカーが測ったもの）。所要時間はこれを足してサーバーの時計にそろえる |
| `started_at_ms` / `finished_at_ms` | 開始・完了 |
| `result` | `succeeded` / `sold_out` / `failed` / `needs_human` |
| `order_id` / `payment_reference` / `payment_due_at_ms` | 注文番号・払込番号・支払期限 |

### timings
ワーカーが送ったリクエストごとの計測値。

| 列 | 内容 |
|---|---|
| `phase` | `login` / `prepare` / `clock` / `purchase` |
| `method` / `url` / `status` | リクエストの内容と HTTP ステータス |
| `started_at_ms` / `duration_ms` | 開始時刻と所要時間 |

## 予約の状態

```
pending ──(ワーカーが取得)──▶ preparing ──(販売開始)──▶ running ──▶ succeeded
   │                                                          ├──▶ failed
   │                                                          └──▶ needs_human
   └──(取りやめ)──▶ cancelled ──(戻す)──▶ pending

手動の予約: pending ──(結果を記録)──▶ succeeded / failed / needs_human
```

- `preparing` / `running` の予約は、API から変更・削除できない
