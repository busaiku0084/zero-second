# 0014. サイトの定義を sites.json に集め、アダプタは SiteRegistry に登録する

- ステータス: 採用
- 日付: 2026-10-09
- 関連: #21、[ADR 0005](0005-respect-site-terms.md)、[ADR 0012](0012-mock-site-as-local-http-server.md)

## 背景

いずれ複数のチケットサイトに対応したい。これまでは、サイトの一覧が TS（`packages/shared/src/sites.ts`）にあり、striker のアダプタは `sites::find` の `match` で引いていた。

- TS の `automation: "auto"` と、Rust に登録したアダプタが一致しているかを確かめる手段がなかった
- 公演 URL がどのサイトのものでも登録できた
- アダプタに設定（接続先など）を渡す口がなく、モックの接続先も公演 URL から取っていた。Docker ではサービス名で接続するため、この形では動かない

## 決定

- サイトの定義は `packages/shared/src/sites.json` に置く（`id`・`name`・`url`・`hosts`・`automation`）。TS は zod で検証して読み込み、Rust はテストで同じファイルを読む
  - [ADR 0005](0005-respect-site-terms.md) で `sites.ts` の `automation` と書いている箇所は、`sites.json` を指すものとする
- 公演 URL のホストが、サイトの `hosts`（サブドメインを含む）と一致しなければ、予約の登録・変更を拒否する
- striker のアダプタは `SiteRegistry::from_config(&SitesConfig)` に登録する。アダプタごとの設定は `config.rs` の `SitesConfig` に置き、環境変数から読む
- アダプタは送り先のホストを設定から決め、予約の公演 URL のホストへはそのまま送らない
- `TicketSite::retry_policy()` でサイトごとに再試行の上限を変えられる（既定は `RetryPolicy::default()`）
- Rust のテスト `auto_sites_and_adapters_match` で「`automation: "auto"` のサイト ⇔ 登録済みのアダプタ」を確かめる
- 手順は `docs/development/adding-a-site.md` にまとめる

## 理由

- サイトを足すときに触る場所が「sites.json に 1 件」「アダプタのファイル」「登録の 1 行」に決まる
- JSON なら TS と Rust の両方から追加の仕組みなしに読める
- 規約で禁止されたサイトを `auto` にしたり、アダプタだけ足したりすると、テストで気づける
- 送り先を設定で固定すれば、予約の URL を書き換えられても想定外のホストにリクエストが飛ばない

## 検討した他の案

- TS から Rust 用のコードを生成する: ビルドの手順が増える。一覧は小さいので、テストで一致を確かめれば足りる
- サイトの定義を DB に置く: 規約の確認結果と結びつくのでコードレビューを通したい。DB だと変更履歴が残らない
- アダプタを動的に読み込む（プラグイン）: 個人用には過剰

## 影響

- `SiteId` は文字列の型になり、リテラル型での補完は効かなくなる（実行時は zod で検証する）
- 公演 URL の検証により、短縮 URL や別ドメインの公演ページは登録できない。必要なら `hosts` に足す
