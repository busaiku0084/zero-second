# API リファレンス

`apps/api`（Hono）。既定で `http://127.0.0.1:47301` で待ち受ける（localhost のみ）。

- リクエスト・レスポンスは JSON。時刻は UNIX ミリ秒（[ADR 0007](adr/0007-time-representation.md)）
- `API_TOKEN` を設定すると、`/health` 以外に `Authorization: Bearer <token>` が必要になる
- 入力の型は `packages/shared/src/schemas.ts`、レスポンスの型は `packages/shared/src/types.ts` が正

## エラーの形

```json
{ "error": "入力内容に誤りがあります", "issues": [{ "path": "quantity", "message": "..." }] }
```

| ステータス | 意味 |
|---|---|
| 400 | 入力の誤り（`issues` に項目ごとの理由） |
| 401 | トークンがない・違う |
| 404 | 対象が見つからない |
| 409 | 状態の衝突（重複したアカウント、実行中の予約の変更など） |
| 500 | 想定外のエラー（API のログを見る） |

## エンドポイント

### `GET /health`
死活確認。認証不要。`{ "status": "ok" }`

### `GET /sites`
対応サイトの一覧。`automation` が `"manual"` のサイトは購入補助のみ（[ADR 0005](adr/0005-respect-site-terms.md)）。

### アカウント

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/accounts` | 一覧（パスワードは含まない） |
| POST | `/accounts` | 登録。`{ site, loginId, password }` → 201。同じサイト・ログイン ID は 409 |
| PATCH | `/accounts/:id` | `loginId` / `password` を更新 |
| DELETE | `/accounts/:id` | 削除 → 204。紐づく予約のアカウントは未指定になる |

### 予約

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/reservations` | 一覧（販売開始の新しい順） |
| GET | `/reservations/:id` | 詳細と実行結果（`runs`） |
| POST | `/reservations` | 登録 → 201。`status` は `pending` |
| PATCH | `/reservations/:id` | 更新。`status` は `pending` / `cancelled` だけ指定できる。実行中（`preparing` / `running`）は 409 |
| DELETE | `/reservations/:id` | 実行結果ごと削除 → 204。実行中は 409 |
| POST | `/reservations/:id/manual-runs` | 手動購入の結果を記録 → 201。予約の `status` も結果に合わせて変わる |

登録の例:

```json
{
  "site": "ticketdive",
  "title": "ワンマンライブ 東京公演",
  "eventUrl": "https://ticketdive.com/event/...",
  "ticketType": "一般",
  "quantity": 2,
  "saleStartsAtMs": 1791684000000,
  "mode": "manual",
  "accountId": null,
  "notes": ""
}
```

- `mode: "auto"` は、`automation: "auto"` のサイトでだけ受け付ける（それ以外は 400）
- `accountId` は予約と同じサイトのアカウントだけ指定できる

手動購入の記録の例:

```json
{
  "result": "succeeded",
  "finishedAtMs": 1791684042318,
  "paymentReference": "1234-5678-9012",
  "paymentDueAtMs": 1791943200000
}
```

- `result`: `succeeded` / `sold_out` / `failed` / `needs_human`
- `startedAtMs` を省略すると販売開始時刻を使う。所要時間（`elapsedMs`）は「完了 + 時計のずれ（`clockOffsetMs`、無ければ 0）− 販売開始」（[ADR 0013](adr/0013-clock-sync-bisection-and-server-time-elapsed.md)）

### 実行結果

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/runs/:id` | 実行結果と、リクエストごとの計測値（`timings`） |

### ダッシュボード

`GET /dashboard?range=7d|30d|90d|all`（既定 `30d`）

- `medianElapsedMs` / `fastestElapsedMs`: 成功した実行の所要時間の中央値・最速
- `resultCounts`: 結果ごとの件数
- `series`: 完了時刻のある実行の一覧（推移グラフ用）
- `nextReservation`: 次に販売開始する待機中の予約
