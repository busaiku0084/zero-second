# zero-second

チケット購入を速くするための個人用ツール。

- `apps/web` — Next.js（予約登録・ダッシュボード）
- `apps/api` — Hono（API）
- `crates/striker` — Rust（購入ワーカー）

## セットアップ

必要なもの: Node.js 24 / pnpm 10 / Rust（stable、`rustup` で導入）

```bash
cp .env.example .env
# CREDENTIALS_ENCRYPTION_KEY に openssl rand -base64 32 の値を入れる
make setup
make dev-api   # http://localhost:8787（起動時に DB のマイグレーションを適用）
make dev-web   # http://localhost:3000
```

予約を登録すると、ダッシュボードで販売開始までカウントダウンします。手で購入したら、予約の詳細画面で「今を購入完了として記録」を押すと、販売開始からの所要時間がミリ秒まで残ります。

ドキュメントの一覧は [docs/README.md](./docs/README.md)。開発の決まりごとは [CLAUDE.md](./CLAUDE.md) と [docs/development/](./docs/development/)、設計判断は [docs/adr/](./docs/adr/README.md) を参照。
