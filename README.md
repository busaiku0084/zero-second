# zero-second

チケット購入を速くするための個人用ツール。

- `apps/web` — Next.js（予約登録・ダッシュボード）
- `apps/api` — Hono（API）
- `apps/mock-site` — Hono（検証用のチケットサイト）
- `crates/striker` — Rust（購入ワーカー）

## セットアップ

必要なもの: Node.js 24 / pnpm 10 / Rust（stable、`rustup` で導入）

```bash
make setup   # 依存のインストール。.env が無ければ作り、暗号化鍵も生成する
make dev     # web・api・モックサイト・ワーカーをまとめて起動 → http://127.0.0.1:47300
```

Docker で動かす場合は `make docker-up`（本番相当）か `make docker-dev`（ホットリロード）。ポートは本職の開発と競合しないよう 127.0.0.1 の 47300〜47302 に固定しています（[ADR 0015](./docs/adr/0015-docker-and-port-range.md)）。

モックサイトを選んで「1 分後」に販売開始の予約を登録すると、ワーカーが販売開始の瞬間に購入し、所要時間とリクエストの内訳が残ります（シナリオで売り切れや CAPTCHA も試せます）。

実在のサイトは利用規約で自動購入が禁止されているため、購入補助として使います。予約を登録すると、ダッシュボードで販売開始までカウントダウンします。手で購入したら、予約の詳細画面で「今を購入完了として記録」を押すと、販売開始からの所要時間がミリ秒まで残ります。

ドキュメントの一覧は [docs/README.md](./docs/README.md)。開発の決まりごとは [CLAUDE.md](./CLAUDE.md) と [docs/development/](./docs/development/)、設計判断は [docs/adr/](./docs/adr/README.md) を参照。
