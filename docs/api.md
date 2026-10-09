# API リファレンス

`apps/api`（Hono）。既定で `http://127.0.0.1:47301` で待ち受ける（localhost のみ）。

- リクエスト・レスポンスは JSON。時刻は UNIX ミリ秒（[ADR 0007](adr/0007-time-representation.md)）
- `API_TOKEN` を設定すると、`/health` 以外に `Authorization: Bearer <token>` が必要になる
- **ログインが必要**。公開のルート（下の「ログイン」で「不要」と書いたもの）以外は、`x-session-token: <セッションのトークン>` が必要（[ADR 0016](adr/0016-login-and-per-user-data.md)）
- データはユーザーごとに分かれている。ほかのユーザーの予約・アカウント・結果は 404 になる
- 入力の型は `packages/shared/src/schemas.ts`、レスポンスの型は `packages/shared/src/types.ts` が正

## エラーの形

```json
{ "error": "入力内容に誤りがあります", "issues": [{ "path": "quantity", "message": "..." }] }
```

| ステータス | 意味 |
|---|---|
| 400 | 入力の誤り（`issues` に項目ごとの理由） |
| 401 | ログインしていない・セッションが無効、ログイン ID かパスワードが違う、`API_TOKEN` が違う |
| 403 | 管理者だけが使えるルート |
| 404 | 対象が見つからない |
| 409 | 状態の衝突（重複したアカウント、実行中の予約の変更、使われているログイン ID など） |
| 429 | ログインの失敗が続いた（15 分に 5 回まで） |
| 500 | 想定外のエラー（API のログを見る） |

## エンドポイント

### `GET /health`
死活確認。認証不要。`{ "status": "ok" }`

### `GET /sites`
対応サイトの一覧。`automation` が `"manual"` のサイトは購入補助のみ（[ADR 0005](adr/0005-respect-site-terms.md)）。

### ログイン

| メソッド | パス | ログイン | 内容 |
|---|---|---|---|
| POST | `/auth/login` | 不要 | `{ loginId, password }` → `{ token, expiresAtMs, user }` |
| GET | `/auth/setup` | 不要 | `{ required }`。ユーザーが 0 人なら true |
| POST | `/auth/setup` | 不要 | 最初のユーザー（管理者）を作る。`{ loginId, password }` → 201 `{ token, expiresAtMs, user }`。ユーザーがいれば 409 |
| GET | `/auth/invitations/:token` | 不要 | `{ valid }`。未使用で期限内なら true |
| POST | `/auth/invitations/:token` | 不要 | 招待からユーザーを作る。`{ loginId, password }` → 201。無効なリンクは 404、使われている ID は 409 |
| GET | `/auth/me` | 必要 | ログイン中のユーザー |
| POST | `/auth/logout` | 必要 | 今のセッションを消す → 204 |
| PUT | `/auth/password` | 必要 | `{ currentPassword, newPassword }` → 204。ほかのセッションは消える |
| GET | `/auth/password-resets/:token` | 不要 | `{ valid, loginId? }` |
| POST | `/auth/password-resets/:token` | 不要 | 再設定リンクで新しいパスワードにする。`{ password }` → `{ token, expiresAtMs, user }`。そのユーザーのほかのセッションは消える。無効なリンクは 404 |

- ログイン ID は半角英数字と `_ . -` で 3〜32 文字（大文字・小文字は区別しない）。パスワードは 10 文字以上
- 停止中のユーザーは、パスワードが正しくてもログインできない（403）
- セッションの有効期限は 30 日

### 管理者

管理者（`role: "admin"`）だけが使える。ほかの人は 403。ほかのユーザーの予約などの中身を見るルートはない。

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/users` | ユーザーの一覧（`disabledAtMs` は停止した時刻） |
| PATCH | `/users/:id` | `{ disabled?, role? }`。停止すると、セッションと未使用の再設定リンクを消す。自分自身は 409 |
| POST | `/users/:id/password-reset` | パスワードの再設定リンクを発行 → 201 `{ token, expiresAtMs }`。24 時間・1 回限り。停止中は 409 |
| GET | `/invitations` | 招待の一覧（トークンは含まない） |
| POST | `/invitations` | 招待を作る。`{ note? }` → 201。`token` はこのときだけ返る。7 日間有効 |
| DELETE | `/invitations/:id` | 未使用の招待を取り消す → 204 |

### アカウント

ログイン中のユーザーのものだけを扱う。

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
- `startedAtMs` を省略すると販売開始時刻を使う。所要時間（`elapsedMs`）は「完了 + 時計のずれ（`clockOffsetMs`、無ければ 0）− 販売開始」（[ADR 0013](adr/0013-clock-sync-bisection-and-server-time-elapsed.md)）。販売開始より前に終わった実行（準备の段階での失敗など）は `null`

### 購入前チェックリスト

予約ごとの確認項目（[ADR 0019](adr/0019-checklist-copied-from-template.md)）。予約を作るとテンプレートの項目が入る。`GET /reservations/:id` の `checklist`、`GET /reservations` の `checklistTotal`・`checklistDone` で読める。

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/reservations/:id/checklist` | `{ label }` → 201 |
| POST | `/reservations/:id/checklist/template` | 今のテンプレートのうち、無い項目を足す → 201（全項目） |
| PATCH | `/reservations/:id/checklist/:itemId` | `{ done }` |
| DELETE | `/reservations/:id/checklist/:itemId` | → 204 |

### 通知

本人の通知と届け先の設定（[ADR 0017](adr/0017-notifications.md)）。

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/notifications?limit=50` | 新しい順の一覧 |
| GET | `/notifications/summary` | `{ unreadCount }` |
| POST | `/notifications/read` | すべて既読にする → 204 |
| GET | `/notifications/settings` | `{ pushPublicKey, pushSubscriptionCount, webhookKind }`。Webhook の URL は返さない |
| PUT | `/notifications/webhook` | `{ webhookUrl }`（Discord / Slack の Webhook のみ。`null` で解除）→ 204 |
| POST | `/notifications/push-subscriptions` | ブラウザの購読 `{ endpoint, keys: { p256dh, auth } }` → 201。鍵が未設定なら 409、対応外の送り先は 400 |
| DELETE | `/notifications/push-subscriptions` | `{ endpoint }` → 204 |
| POST | `/notifications/test` | テスト通知を作って送る → `{ pushStatus, webhookStatus }` |

予約の `reminderMinutes`（販売開始の何分前に知らせるか。既定 `[30, 5]`、最大 5 個）は、作成・更新で指定できる。

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
