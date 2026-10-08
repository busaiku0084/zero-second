# 0002. pnpm と Cargo のモノレポにする

- ステータス: 採用
- 日付: 2026-10-08
- 関連: #1

## 背景

Web（Next.js）、API（Hono）、購入ワーカー（Rust）の 3 つを作る。DB スキーマや入力の型は複数のアプリで共有する。

## 決定

1 つのリポジトリに、TS は pnpm workspace（`apps/*`・`packages/*`）、Rust は Cargo workspace（`crates/*`）として同居させる。共通のコマンドは `Makefile` にまとめる。

- `apps/web`・`apps/api`: アプリ
- `packages/shared`: web と api が共有する zod スキーマ・型・サイト一覧
- `crates/striker`: 購入ワーカー
- `db/migrations`: TS と Rust が共有する SQL

## 理由

- スキーマの変更と、それを使う各アプリの変更を 1 つの PR にできる
- 個人開発なので、リポジトリを分ける管理の手間に見合わない

## 検討した他の案

- アプリごとにリポジトリを分ける: 共有スキーマの同期が面倒
- Turborepo / Nx を入れる: 現状の規模では pnpm の `-r` と Makefile で足りる

## 影響

- CI は TS と Rust のジョブに分かれる
- Rust 側の型（`crates/striker/src/model.rs`）は TS の型と自動では同期しない。DB スキーマを変えたら両方を直す
