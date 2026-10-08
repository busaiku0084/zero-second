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

サイトごとの対応状況は `docs/sites/README.md` にまとめる。

## アーキテクチャ

```
zero-second/
├── apps/
│   ├── web/              # Next.js（App Router）予約登録・ダッシュボード
│   └── api/              # Hono 予約・アカウント・実行結果の API
├── crates/
│   └── striker/          # Rust 購入ワーカー
│       └── src/
│           ├── site.rs   # trait TicketSite（login / prepare / purchase）
│           ├── sites/    # サイトアダプタ（mock のみ）
│           ├── clock.rs  # サーバー時刻とのずれの推定
│           ├── metrics.rs# リクエスト単位の計測値
│           └── model.rs  # 予約・購入結果のモデル
├── db/migrations/        # SQLite のスキーマ（TS・Rust 共通）
└── docs/                 # 設計メモ・サイト別の調査結果
```

- web と api は TS、購入の実行部分だけ Rust
- api と striker は SQLite を共有し、予約の受け渡しは `reservations.status` で行う（キュー用ミドルウェアは使わない）
- 時刻はすべて UNIX ミリ秒の INTEGER で保存する

## 速さについての方針

速さを決めるのは言語よりネットワーク。次を優先する。

1. ログイン・ID の取得・TLS 接続の確立は販売開始前に済ませ、接続を張ったまま待つ
2. サーバー時刻とのずれを測って補正し、開始の瞬間に送る
3. 購入までのリクエスト数を最小にする
4. 計測できないものは改善できない。新しいリクエストを追加したら必ず `timings` に記録する

## 開発コマンド

```bash
make setup        # 依存のインストール
make dev-web      # http://localhost:3000
make dev-api      # http://localhost:8787
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
