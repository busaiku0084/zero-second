# アーキテクチャ

## 構成

```
┌────────────┐  Server Components /   ┌────────────┐            ┌──────────────────┐
│  ブラウザ   │ ─ Server Actions ───▶ │  apps/web  │ ─ HTTP ──▶ │    apps/api      │
│            │ ◀───── HTML ───────── │  Next.js   │            │ Hono + node:sqlite│
└────────────┘                        └────────────┘            └────────┬─────────┘
                                                                         │ 読み書き
                                                                ┌────────▼─────────┐
                                                                │  SQLite（WAL）    │
                                                                │ data/*.sqlite    │
                                                                └────────▲─────────┘
                                                                         │ ポーリング・結果の保存
                                                                ┌────────┴─────────┐   HTTP   ┌────────────────┐
                                                                │ crates/striker   │ ───────▶ │ apps/mock-site │
                                                                │ Rust（tokio）     │          │（今は検証用の  │
                                                                └──────────────────┘          │ モックのみ）   │
                                                                                              └────────────────┘
```

- ブラウザは API を直接呼ばない（[ADR 0009](adr/0009-server-side-data-access.md)）
- 通知（リマインド・自動購入の結果）は API の中の Notifier が DB から作り、アプリ内・ブラウザ通知・Discord / Slack に届ける。ワーカーは結果を書くだけ（[ADR 0017](adr/0017-notifications.md)）
- ログインは ID + パスワード。web はセッションを HttpOnly の Cookie に持ち、API に `x-session-token` で渡す。API が毎回確かめ、本人のデータだけを返す（[ADR 0016](adr/0016-login-and-per-user-data.md)）
- API とワーカーは DB だけでつながる（[ADR 0004](adr/0004-shared-sqlite-without-queue.md)）
- 利用規約で自動化を禁止するサイトには、ワーカーからアクセスしない（[ADR 0005](adr/0005-respect-site-terms.md)）
- 自動購入を許可しているチケットサイトはまだないため、ワーカーの購入先は検証用のサイトだけ: API で買うモックサイト（[ADR 0012](adr/0012-mock-site-as-local-http-server.md)）と、ブラウザ操作で買う Sauce Demo（[ADR 0021](adr/0021-browser-mode.md)）

## モックサイトで通しで動かす

```bash
make setup   # 初回のみ（.env も作る）
make dev     # web（:47300）・api（:47301）・mock-site（:47302）・striker をまとめて起動
# ブラウザ操作モードを試すなら Sauce Demo も（Docker のみ）: docker compose up -d saucedemo（:47303）
# Docker なら make docker-up（本番相当）か make docker-dev（ホットリロード）
```

1. 予約の登録で「モックサイト（検証用）」を選び、シナリオを選ぶ（公演名と URL が埋まる）
2. 販売開始の「1 分後」を押して登録する。購入のしかたは「自動で購入」が選ばれている
3. 予約詳細は、ワーカーが処理しているあいだ自動で読み直される。販売開始になると状態と結果が変わる
4. 記録の「詳細」で、ログイン・事前準備・時刻合わせ・購入のリクエストごとの時間を見る

| シナリオ | 結果 |
|---|---|
| 成功（`ok`） | 購入済み。注文番号・払込番号・支払期限が入る |
| 混雑（`flaky`） | 503 を 2 回返したあと成功（再試行の確認） |
| 低速（`slow`） | 購入の応答に約 0.8 秒かかる |
| 売り切れ（`sold-out`） | 再試行せずに失敗（結果は売り切れ） |
| CAPTCHA（`captcha`） | 再試行せずに「要対応」で止まる |
| 待機列（`queue`） | 再試行せずに「要対応」で止まる |

アカウントのログイン ID を `locked` にすると、どのシナリオでもログインで失敗する（ログイン失敗の確認用）。

## 手動購入（購入補助）の流れ

1. Web で予約（サイト・公演・販売開始・席種・枚数）を `mode: manual` で登録する
2. 販売開始の前に通知が届く（既定は 30 分前・5 分前。ADR 0017）
3. 予約詳細の購入前チェックリストで準備を済ませる（すべて済むと一覧に「準備完了」。ADR 0019）
4. 予約詳細の「ランチャーを開く」で、端末の時計のずれを補正したカウントダウンと購入するもののメモを出す（ADR 0018）
5. 販売開始になったら、ランチャーのボタンで公演ページを開いて手で購入する
6. 終わった瞬間に「今を購入完了として記録」を押し、結果・払込番号を保存する
7. ダッシュボードで、所要時間の中央値・最速・推移を振り返る

## 自動購入の流れ（自動化が許可されたサイトのみ）

[ADR 0011](adr/0011-worker-polling-and-timing-buffer.md) の詳細。

```
scheduler（1 秒ごと）
  └─ 販売開始 2 分前を過ぎた auto の予約を pending → preparing で取得
       └─ executor（予約ごとのタスク）
            1. run を作成
            2. 予約のアカウントを読み、パスワードを復号（持ち主・サイトが予約と同じものだけ。ADR 0008, 0016）
            3. login       … セッションを確立
            4. prepare     … 公演・席種の ID を取得し、接続を温めておく
            5. clock sync  … サーバー時刻とのずれを推定（秒の切り替わりを二分探索。ADR 0013）
            6. 販売開始まで待機（sleep → 最後はビジーウェイト）
            7. status を running に
            8. purchase    … RetryPolicy の範囲で再試行
            9. run と予約の状態を保存し、溜めた timings をまとめて書く
```

- 売り切れ・CAPTCHA・待機列・購入上限は再試行しない。人の対応が必要なものは `needs_human` にする
### ワーカーのモジュール

| ファイル | 役割 |
|---|---|
| `main.rs` | 起動。設定の読み込み・マイグレーションの確認（API が当てるまで最大 30 秒待つ）・途中で止まった予約の復旧 |
| `config.rs` | 環境変数（`DATABASE_URL`・`STRIKER_POLL_INTERVAL_MS`・`STRIKER_LEAD_MS`・`CREDENTIALS_ENCRYPTION_KEY`）と、アダプタごとの設定（`SitesConfig`） |
| `crypto.rs` | サイトのログイン情報の復号（API と同じ AES-256-GCM の形式） |
| `scheduler.rs` | ポーリングと、予約ごとのタスクの起動。Ctrl+C で実行中の購入を待って止まる |
| `executor.rs` | 予約 1 件の購入処理と結果の保存 |
| `db.rs` | 予約の取得（条件付き更新）・状態の更新・結果と計測値の保存 |
| `clock.rs` | 現在時刻・サーバー時刻とのずれの推定（`OffsetBounds`）・目標時刻までの待機 |
| `http.rs` | `TimedClient`。リクエストを計測し、計測値をメモリに溜める |
| `browser.rs` | `BrowserSession`。ヘッドレス Chrome を操作し、操作ごとに計測する（ブラウザ操作モード。ADR 0021） |
| `retry.rs` | `RetryPolicy`。回数と間隔に上限のある再試行 |
| `site.rs` | `TicketSite` trait と `SiteError`・`SiteContext` |
| `sites/` | `SiteRegistry` と登録済みのアダプタ（`mock.rs`: API、`saucedemo.rs`: ブラウザ操作。`fake.rs` はテスト用）。追加の手順は `docs/development/adding-a-site.md` |

### 残っていること

ワーカーの土台はそろっている。残りはサイトごとのアダプタだけ（`docs/development/adding-a-site.md`）。

- 起動時に、前回途中で止まって `preparing` / `running` のまま残った自動購入の予約を `failed` にする
- 接続のウォームアップは、`prepare` と時刻合わせのリクエスト（販売開始の 0.5 秒前まで）が兼ねる。`TimedClient` は 300 秒まで接続を張ったまま待てる

## 予約の状態

`docs/database.md` の「予約の状態」を参照。
