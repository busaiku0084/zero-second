# zero-second

チケット購入を速くするための個人用ツール。

- `apps/web` — Next.js（予約登録・ダッシュボード）
- `apps/api` — Hono（API）
- `apps/mock-site` — Hono（検証用のチケットサイト）
- `crates/striker` — Rust（購入ワーカー）

## セットアップ

必要なもの: Node.js 24 / pnpm 10 / Rust（stable、`rustup` で導入）

```bash
make setup   # 依存のインストール。.env が無ければ作り、暗号化鍵とブラウザ通知の鍵も生成する
make dev     # web・api・モックサイト・ワーカーをまとめて起動 → http://127.0.0.1:47300
```

Docker で動かす場合は `make docker-up`（本番相当）か `make docker-dev`（ホットリロード）。ポートは本職の開発と競合しないよう 127.0.0.1 の 47300〜47303 に固定しています（[ADR 0015](./docs/adr/0015-docker-and-port-range.md)）。

モックサイトを選んで「1 分後」に販売開始の予約を登録すると、ワーカーが販売開始の瞬間に購入し、所要時間とリクエストの内訳が残ります（シナリオで売り切れや CAPTCHA も試せます）。

実在のサイトは利用規約で自動購入が禁止されているため、購入補助として使います。手で購入したら、予約の詳細画面で「今を購入完了として記録」を押すと、販売開始からの所要時間がミリ秒まで残ります。

## できること

| 機能 | 内容 |
|---|---|
| ログイン | ID + パスワード、招待制。データはユーザーごとに分かれる。管理者はパスワードの再設定リンク・停止・権限の変更ができる（[ADR 0016](./docs/adr/0016-login-and-per-user-data.md)・[0020](./docs/adr/0020-user-management.md)） |
| 予約 | サイト・公演・販売開始・席種・枚数・支払い・アカウント。手動購入（購入補助）か自動購入（許可されたサイトのみ） |
| 購入前チェックリスト | サイトと購入のしかたに合わせたテンプレート。すべて済むと一覧に「準備完了」（[ADR 0019](./docs/adr/0019-checklist-copied-from-template.md)） |
| 通知 | 販売開始の N 分前のリマインドと自動購入の結果を、アプリ内・ブラウザ通知・Discord / Slack に（[ADR 0017](./docs/adr/0017-notifications.md)） |
| ランチャー | 端末の時計のずれを補正したカウントダウンと、公演ページを開くボタン（[ADR 0018](./docs/adr/0018-browser-clock-correction.md)） |
| ダッシュボード | 販売開始から購入完了までの所要時間（中央値・最速・推移・内訳） |
| 自動購入のワーカー | 予約の取得・ログイン情報の復号・時刻合わせ・販売開始の瞬間の購入・上限つきの再試行・計測。CAPTCHA などは止めて通知する |

## 残っていること

ワーカーの土台はそろっていて、残りは**サイトごとのアダプタ**（`crates/striker/src/sites/`）だけです。手順は [docs/development/adding-a-site.md](./docs/development/adding-a-site.md)。必ず先に利用規約を確認し、自動化を禁止しているサイトのアダプタは作りません（[ADR 0005](./docs/adr/0005-respect-site-terms.md)）。

ドキュメントの一覧は [docs/README.md](./docs/README.md)。開発の決まりごとは [CLAUDE.md](./CLAUDE.md) と [docs/development/](./docs/development/)、設計判断は [docs/adr/](./docs/adr/README.md) を参照。
