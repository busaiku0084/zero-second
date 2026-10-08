# 0006. API の DB ドライバに node:sqlite を使う

- ステータス: 採用
- 日付: 2026-10-09
- 関連: #2, #6

## 背景

API から SQLite を使うドライバを選ぶ必要があった。Node.js 24 を前提にしている。

## 決定

Node.js 組み込みの `node:sqlite`（`DatabaseSync`）を使う。ORM は使わず、SQL を直接書いて `apps/api/src/lib/rows.ts` で型に変換する。

## 理由

- ネイティブアドオンのビルドが要らず、CI やマシンの入れ替えで壊れにくい
- テーブル数が少なく、ORM を入れるほどではない
- マイグレーションは素の SQL（`db/migrations`）で Rust 側と共有したい

## 検討した他の案

- better-sqlite3: 実績はあるがネイティブビルドが必要
- Drizzle / Prisma: 型は便利だが、Rust 側とスキーマ定義が二重になる

## 影響

- `node:sqlite` は Node.js 24 時点で experimental 扱いで、起動時に警告が出る。API の破壊的変更があれば追従する
- SQL を直接書くので、入力値は必ずプレースホルダ（`?`）で渡す
