# 開発の進め方

## 流れ

1. **issue を起点にする**。やることが issue になっていなければ先に作る（ラベル: `mvp`・`area:*`・`site:*`・`assist`・`research`）
2. **ブランチを切る**。`main` に直接コミットしない
   - `feat/<内容>`: 機能追加
   - `fix/<内容>`: 不具合の修正
   - `docs/<内容>`: ドキュメントのみ
   - `chore/<内容>`: 設定・依存・雑務
3. **実装する**。設計の判断を伴うなら ADR を書く（`docs/adr/`）
4. **確認する**。`make check`・`make type-check`・`make test` を通す。画面を変えたら実際に起動して見る。Claude Code では `quality-gate` スキルでまとめて確認できる
5. **PR を出す**（後述のテンプレート）
6. **CI が両方（ts / rust）成功したことを確認してから**、スカッシュでマージする。マージ後はブランチを消す

## コミットメッセージ

```
<type>(<scope>): <日本語で要約>

- 変更の要点を箇条書き

Closes #N
```

- `type`: `feat` / `fix` / `docs` / `refactor` / `test` / `chore`
- `scope`: 省略可（`web` / `api` / `striker` / `db` など）
- スカッシュマージするので、PR のタイトルがそのまま `main` のコミットになる。PR タイトルも同じ形式にする

## PR の書き方

```
## 概要
何のための変更か

## 変更内容
- 主な変更

## 確認
- [x] make check / make type-check / make test
- [x] 画面・動作の確認（何を見たか）

Closes #N
```

- issue を完了させる PR には `Closes #N`、一部だけなら `Refs #N`
- スクリーンショットや、確認できなかったことがあれば書く

## CI

`.github/workflows/ci.yml` で、PR と `main` への push ごとに次を実行する。

- ts: `pnpm check`（Biome）・`pnpm type-check`・`pnpm test`
- rust: `cargo fmt --check`・`cargo clippy -D warnings`・`cargo test`

## GitHub のアカウント

このリポジトリは busaiku0084 アカウントで操作する。ローカルのクローンには、busaiku0084 のトークンを使う credential helper と、コミットの作者（noreply アドレス）をリポジトリ単位で設定してある。`gh` を使うときは `GH_TOKEN=$(gh auth token --user busaiku0084)` を付ける。
