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
                                                                ┌────────┴─────────┐   HTTP   ┌──────────────┐
                                                                │ crates/striker   │ ───────▶ │ チケットサイト │
                                                                │ Rust（tokio）     │          │（自動化が許可  │
                                                                └──────────────────┘          │ されたものだけ）│
                                                                                              └──────────────┘
```

- ブラウザは API を直接呼ばない（[ADR 0009](adr/0009-server-side-data-access.md)）
- API とワーカーは DB だけでつながる（[ADR 0004](adr/0004-shared-sqlite-without-queue.md)）
- 利用規約で自動化を禁止するサイトには、ワーカーからアクセスしない（[ADR 0005](adr/0005-respect-site-terms.md)）

## 手動購入（購入補助）の流れ

1. Web で予約（サイト・公演・販売開始・席種・枚数）を `mode: manual` で登録する
2. ダッシュボードと予約詳細で、販売開始までカウントダウンする
3. 販売開始になったら、公演ページを開いて手で購入する
4. 終わった瞬間に「今を購入完了として記録」を押し、結果・払込番号を保存する
5. ダッシュボードで、所要時間の中央値・最速・推移を振り返る

## 自動購入の流れ（自動化が許可されたサイトのみ）

[ADR 0011](adr/0011-worker-polling-and-timing-buffer.md) の詳細。

```
scheduler（1 秒ごと）
  └─ 販売開始 2 分前を過ぎた auto の予約を pending → preparing で取得
       └─ executor（予約ごとのタスク）
            1. run を作成
            2. login       … セッションを確立
            3. prepare     … 公演・席種の ID を取得し、接続を温めておく
            4. clock sync  … サーバー時刻とのずれを推定
            5. 販売開始まで待機（sleep → 最後はビジーウェイト）
            6. status を running に
            7. purchase    … RetryPolicy の範囲で再試行
            8. run と予約の状態を保存し、溜めた timings をまとめて書く
```

- 売り切れ・CAPTCHA・待機列・購入上限は再試行しない。人の対応が必要なものは `needs_human` にする
### ワーカーのモジュール

| ファイル | 役割 |
|---|---|
| `main.rs` | 起動。設定の読み込み・マイグレーションの確認・途中で止まった予約の復旧 |
| `config.rs` | 環境変数（`DATABASE_URL`・`STRIKER_POLL_INTERVAL_MS`・`STRIKER_LEAD_MS`） |
| `scheduler.rs` | ポーリングと、予約ごとのタスクの起動。Ctrl+C で実行中の購入を待って止まる |
| `executor.rs` | 予約 1 件の購入処理と結果の保存 |
| `db.rs` | 予約の取得（条件付き更新）・状態の更新・結果と計測値の保存 |
| `clock.rs` | 現在時刻・サーバー時刻とのずれの推定・目標時刻までの待機 |
| `http.rs` | `TimedClient`。リクエストを計測し、計測値をメモリに溜める |
| `retry.rs` | `RetryPolicy`。回数と間隔に上限のある再試行 |
| `site.rs` | `TicketSite` trait と `SiteError`・`SiteContext` |
| `sites/` | 登録済みのアダプタ（今はモックのみ） |

### 骨格の段階で残っていること（#4）

- ログイン情報の復号（`SiteContext.credentials` は今は常に None。[ADR 0008](adr/0008-credential-encryption.md)）
- 時刻合わせの精度。`Date` ヘッダーは秒単位なので誤差が最大 ±500ms ある
- `needs_human` になったときの通知（#11）
- 起動時の復旧は実装済み。前回途中で止まって `preparing` / `running` のまま残った自動購入の予約を `failed` にする

## 予約の状態

`docs/database.md` の「予約の状態」を参照。
