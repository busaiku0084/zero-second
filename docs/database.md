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

### accounts
サイトごとのログイン情報。

| 列 | 内容 |
|---|---|
| `site` | サイト ID（`packages/shared/src/sites.ts`） |
| `login_id` | ログイン ID。`(site, login_id)` で一意 |
| `encrypted_credentials` | AES-256-GCM で暗号化したパスワード（[ADR 0008](adr/0008-credential-encryption.md)） |

### reservations
購入したい公演の予約。

| 列 | 内容 |
|---|---|
| `account_id` | 使うアカウント（任意。アカウント削除時は NULL） |
| `site` / `title` / `event_url` | サイト・公演名・公演ページ |
| `ticket_type` / `quantity` / `payment_method` | 席種・枚数・支払い方法（今は `convenience_store` のみ） |
| `sale_starts_at_ms` | 販売開始時刻 |
| `mode` | `manual`（手で購入）/ `auto`（ワーカーが購入） |
| `status` | 下の状態遷移を参照 |

### runs
購入の実行結果（手動の記録と、ワーカーの実行の両方）。

| 列 | 内容 |
|---|---|
| `mode` | `manual` / `auto` |
| `clock_offset_ms` | サーバー時刻 − 端末の時刻（ワーカーが測ったもの） |
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
