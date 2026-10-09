---
name: quality-gate
description: zero-second の品質ゲート。make check / make type-check / make test と、CLAUDE.md の禁止パターン検出を実行して PASS/FAIL を判定する。PR を出す前や「品質チェックして」で使う。
allowed-tools: Bash(make *), Bash(pnpm *), Bash(cargo *), Bash(git *), Bash(grep *), Read, Glob, Grep
---

# 品質ゲート (zero-second)

## Step 1: 変更範囲の検出

```bash
MB=$(git merge-base HEAD origin/main)
git diff "$MB" --name-only        # コミット済み + 未コミット
git status --short | grep '^??'   # 未追跡
```

- `apps/web/` `apps/api/` → TS チェック対象
- `crates/` → Rust チェック対象
- `db/migrations/` → マイグレーションの確認対象

## Step 2: 自動チェック

```bash
make check
make type-check
make test
```

修正可能な format / lint は `make check-fix` で直してよい。ただし今回の変更ファイル以外に差分が出たら戻す。

## Step 3: 禁止パターン検出

追加行（`git diff "$MB"` の `^+` 行と未追跡ファイル全体）を対象に調べる。

| # | 内容 | 判定 |
|---|---|---|
| 1 | Cookie・トークン・パスワード・`Bearer ` の実値、`.har` ファイル | **[CRITICAL] FAIL** |
| 2 | CAPTCHA の自動解答、待機列や購入上限を回避する処理 | **[CRITICAL] FAIL** |
| 3 | 上限のない再試行ループ（`loop` / `while` で回数・間隔の制限なし） | FAIL |
| 4 | `crates/striker/src/sites/` に新しいサイトが追加されたのに `docs/sites/README.md` に利用規約の確認記録がない | FAIL |
| 5 | TS の `any`、Rust のテスト外の `unwrap()` / `expect()` | FAIL |
| 6 | 既存マイグレーションファイルの書き換え | FAIL |
| 7 | `console.log` / `dbg!` の残骸、`/Users/` などのローカルパス | FAIL |
| 8 | issue 番号のない TODO | FAIL |
| 9 | 設計の判断（依存の追加・スキーマ変更・外部とのやり取り・守るラインの変更）があるのに ADR がない | FAIL（`new-adr` スキルで追加） |
| 10 | コードの変更と `docs/`（api.md・database.md・architecture.md・operations.md）が食い違っている | FAIL |
| 11 | 47300〜47302 以外のポート、`127.0.0.1:` の付かない `ports:`、`container_name`・固定サブネット（本職の開発と競合させない。ADR 0015） | FAIL |
| 12 | `packages/shared/src/sites.json` の `automation: "auto"` が `docs/sites/README.md` の判断と食い違っている | **[CRITICAL] FAIL** |
| 13 | `accounts`・`reservations` を読み書きする API のクエリに `user_id` の条件がない、`PUBLIC_PATHS` に理由なくルートを足した、パスワード・セッション・招待のトークンを平文で保存・ログ出力している（ADR 0016） | **[CRITICAL] FAIL** |

機械的に判定しきれないもの（2・3 など）は該当箇所を読んで判断する。

## 結果サマリー

```
## quality-gate 結果: PASS / FAIL

| チェック | 結果 | 詳細 |
|---|---|---|
| make check | | |
| make type-check | | |
| make test | | |
| 禁止パターン | | |
```
