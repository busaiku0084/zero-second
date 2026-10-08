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
- ワーカーのモジュール構成は `crates/striker/src/` の各ファイル先頭のコメントを参照

## 予約の状態

`docs/database.md` の「予約の状態」を参照。
