# CLAUDE.md - zero-second

## プロジェクト概要

チケットサイトでの購入を速くするための個人用ツール。
Web で予約を登録し、販売開始時刻に Rust のワーカー（striker）が購入処理を実行する。
購入にかかった時間はリクエスト単位で記録し、ダッシュボードで振り返る。

- 個人利用のみ。転売目的には使わない
- 複数サイト対応を見据え、サイトごとの処理はアダプタとして分離する

## 守るライン（最優先）

- **自動購入・BOT を利用規約で禁止しているサイトのアダプタは作らない**。新しいサイトに着手する前に、必ず `.claude/skills/new-site-adapter` の手順で利用規約を確認する
- CAPTCHA・待機列・1 人あたりの購入枚数上限は回避しない。検知したら `SiteError::HumanActionRequired` で停止し、人に通知する
- 再試行には回数と間隔の上限を設け、サイトに過剰なリクエストを送らない
- ログイン情報・Cookie・トークン・HAR ファイルはコミットしない。ログやテストのフィクスチャにも実値を残さない

サイトごとの対応状況は `docs/sites/README.md` にまとめ、`packages/shared/src/sites.ts` の `automation` と一致させる。
`automation: "manual"` のサイトでは自動購入（`mode: "auto"`）を選べないようにしている。この制限は外さない。

## アーキテクチャ

```
zero-second/
├── apps/
│   ├── web/              # Next.js（App Router）予約登録・ダッシュボード
│   ├── api/              # Hono 予約・アカウント・実行結果の API（node:sqlite）
│   └── mock-site/        # Hono 検証用のチケットサイト（striker の購入先は今これだけ）
├── packages/
│   └── shared/           # web・api 共通のスキーマ（zod）・型・サイト一覧
├── crates/
│   └── striker/          # Rust 購入ワーカー
│       └── src/
│           ├── scheduler.rs # 予約のポーリング
│           ├── executor.rs  # 予約 1 件の購入処理
│           ├── site.rs      # trait TicketSite（login / prepare / purchase）
│           ├── sites/       # サイトアダプタ（mock のみ。fake はテスト用）
│           ├── clock.rs     # 時刻合わせと待機
│           ├── http.rs      # 計測つき HTTP クライアント（TimedClient）
│           ├── retry.rs     # 上限つき再試行（RetryPolicy）
│           └── db.rs        # 予約の取得・結果の保存
├── db/migrations/        # SQLite のスキーマ（TS・Rust 共通）
└── docs/                 # 設計メモ・サイト別の調査結果
```

- web と api は TS、購入の実行部分だけ Rust
- api と striker は SQLite を共有し、予約の受け渡しは `reservations.status` で行う（キュー用ミドルウェアは使わない）
- 時刻はすべて UNIX ミリ秒の INTEGER で保存する
- マイグレーションは api の起動時に自動で適用される（`schema_migrations` で管理）
- アカウントのパスワードは AES-256-GCM で暗号化して保存し、API のレスポンスには含めない

## ドキュメント

詳細は `docs/` にある。作業の前に関係するものを読み、コードを変えたら同じ PR で直す。

- `docs/development/coding-guidelines.md` — コーディングルールの詳細（このファイルは要点のみ）
- `docs/development/workflow.md` — issue・ブランチ・コミット・PR・CI の進め方
- `docs/adr/` — 設計判断の記録。判断を伴う変更をしたら `new-adr` スキルで ADR を追加する
- `docs/architecture.md`・`docs/api.md`・`docs/database.md`・`docs/operations.md`
- `docs/sites/README.md` — サイトごとの利用規約の確認結果

## 速さについての方針

速さを決めるのは言語よりネットワーク。次を優先する。

1. ログイン・ID の取得・TLS 接続の確立は販売開始前に済ませ、接続を張ったまま待つ
2. サーバー時刻とのずれを測って補正し、開始の瞬間に送る
3. 購入までのリクエスト数を最小にする
4. 計測できないものは改善できない。新しいリクエストを追加したら必ず `timings` に記録する

## 開発コマンド

```bash
make setup        # 依存のインストールと .env の作成
make dev          # 下の 4 つをまとめて起動
make dev-web      # http://localhost:3000
make dev-api      # http://localhost:8787
make dev-mock-site # http://127.0.0.1:8788（検証用のチケットサイト）
make dev-striker  # ワーカーの起動
make check        # Biome + rustfmt + clippy（警告 0 件）
make check-fix    # 自動修正
make type-check   # tsc
make test         # Vitest + cargo test
```

## コーディング規約

### 共通
- コメント・ドキュメントは日本語、識別子は英語
- TODO には対応する issue 番号を付ける（例: `TODO(#4)`）

### TypeScript
- Biome の警告 0 件を維持する
- `any` は使わない。外部からの入力は境界でバリデーションする
- API のルートを追加したら `app.request()` を使った Vitest テストを付ける

### Web（Next.js）
- 色・書体・余白は `apps/web/src/app/globals.css` のトークンだけを使う。コンポーネントに色を直書きしない（ライト・ダーク両方を `:root` / `prefers-color-scheme` / `data-theme` で定義している）
- グラフは dataviz の検証済みパレット（`--series-1..3`）と仕様に従う：線 2px、二重軸は使わない、凡例か直接ラベル、表ビューへの切り替え、ホバーとキーボードの両方で値を読めること
- 状態（購入済み・売り切れなど）は色だけで伝えず、アイコン + ラベルを付ける（`StatusPill` / `ResultPill`）
- 日時の入力と表示は日本時間。変換は `lib/format.ts` の関数を使う
- API はサーバー側からだけ呼ぶ（`lib/api.ts`）。更新系は Server Actions（`app/actions.ts`）で、入力は `@zero-second/shared` の zod スキーマで検証する

### Rust
- `cargo clippy -- -D warnings` が通る状態を保つ
- エラーはサイト層では `SiteError`、それ以外は `anyhow::Result`
- `unwrap()` / `expect()` はテスト以外で使わない
- 時刻計算などの純粋関数には単体テストを付ける

### DB
- マイグレーションは `db/migrations/NNNN_name.sql` に追記する。既存ファイルは書き換えない
- 破壊的変更（列の削除など）は避け、追加で対応する

## Git 運用

- `main` に直接コミットしない。`feat/` `fix/` `chore/` などのブランチを切って PR を出す
- issue を起点に進め、PR 本文に `Closes #N` を書く
- このリポジトリは busaiku0084 アカウントで操作する（ローカルの credential helper で設定済み）
