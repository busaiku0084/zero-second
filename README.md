# zero-second

チケット購入を速くするための個人用ツール。

- `apps/web` — Next.js（予約登録・ダッシュボード）
- `apps/api` — Hono（API）
- `crates/striker` — Rust（購入ワーカー）

## セットアップ

必要なもの: Node.js 24 / pnpm 10 / Rust（stable、`rustup` で導入）

```bash
cp .env.example .env
make setup
make dev-api
make dev-web
```

開発の決まりごとは [CLAUDE.md](./CLAUDE.md)、構成は [docs/architecture.md](./docs/architecture.md)、サイトごとの対応状況は [docs/sites/README.md](./docs/sites/README.md) を参照。
