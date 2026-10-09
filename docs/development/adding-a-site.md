# サイトを追加する

新しいチケットサイトに対応するときの手順。サイトの定義とアダプタの登録の仕組みは [ADR 0014](../adr/0014-site-registry.md)。

## 0. 利用規約を確認する（必ず最初に）

`.claude/skills/new-site-adapter` の手順で利用規約を読み、`docs/sites/README.md` に記録する（[ADR 0005](../adr/0005-respect-site-terms.md)）。

- 自動化・BOT を禁止している → **購入補助（`manual`）だけ**。1 と 4 だけ行い、アダプタは作らない
- 禁止していない・公式 API がある → 1〜4 を行う
- 判断がつかない → 進めずに確認する

## 1. サイトを定義する（web・api・striker 共通）

`packages/shared/src/sites.json` に 1 件足す。

```json
{
  "id": "example",
  "name": "Example チケット",
  "url": "https://tickets.example.com/",
  "hosts": ["tickets.example.com"],
  "automation": "manual"
}
```

| 項目 | 内容 |
|---|---|
| `id` | 英小文字・数字・`-`。DB の `site` 列とアダプタの `id()` に使う。あとから変えない |
| `hosts` | 公演 URL として受け付けるホスト。サブドメインも通る。別サイトの URL の登録を防ぐ |
| `automation` | `manual`（購入補助のみ）か `auto`（striker が購入）。規約の確認結果と一致させる |

これだけで、予約フォームのサイトの選択肢・API の検証・一覧の表示名に反映される。

サイトに特有の準備（本人確認など）があれば、`packages/shared/src/checklist.ts` の購入前チェックリストのテンプレートにも足す。

## 2. アダプタを書く（`auto` のときだけ）

1. 操作の方法を決める（[ADR 0021](../adr/0021-browser-mode.md)）
   - サイトに使える API があれば **Http**（`ctx.http` で叩く）。速い。見本は `sites/mock.rs`
   - 画面の操作でしか買えなければ **Browser**（`driver()` で `Driver::Browser` を返し、`ctx.browser()?` の goto / click / fill / wait_for で操作する）。見本は `sites/saucedemo.rs`
     - セレクタはテスト用の属性（`data-test` など）や id のように変わりにくいものを使う
     - 準備（prepare）で購入の直前の画面まで進め、販売開始の瞬間はボタン 1 回で済むようにする。要る値は `ctx.prepared` に読んでおく
     - 成功の画面とエラーの表示は `wait_for_any` で同時に待ち、エラーの文言をエラーに含める
2. `crates/striker/src/sites/<id>.rs` に `TicketSite` を実装する
   - `id()` は sites.json の `id` と同じにする
   - リクエストは必ず `ctx.http`（`TimedClient`）で送る。計測値が `timings` に残る
   - 売り切れは `SiteError::SoldOut`、CAPTCHA・待機列・購入上限は `SiteError::HumanActionRequired` にする（再試行されない）
   - 送り先のホストは固定する。予約の公演 URL のホストへそのまま送らない
   - 必要なら `retry_policy()` で再試行を既定より厳しくする
   - サーバー時刻を測れる URL があれば `clock_probe_url()` で返す（販売開始の 0.5 秒前まで送るので、接続を温める役目も兼ねる）
   - ログインが要るサイトは `requires_credentials()` で true を返し、`login()` で `ctx.credentials`（復号済みのログイン ID とパスワード）を使う。値はログ・エラーメッセージ・`timings` の URL に入れない
3. 接続先などの設定が要るなら、`config.rs` の `SitesConfig` に項目を足し、環境変数から読む（`.env.example`・`docs/operations.md` にも書く）
4. `sites/mod.rs` の `SiteRegistry::from_config` に 1 行足して登録する
5. テストを書く。応答の解釈（`SiteError` への振り分けなど）は純粋関数にして単体テストにする。記録した応答を使う場合は実値を伏せる

## 3. 確かめる

```bash
make check && make test
```

`sites::tests::auto_sites_and_adapters_match` が、sites.json の `automation: "auto"` と登録済みのアダプタが一致しているかを確かめる。片方だけ変えるとここで落ちる。

## 4. 記録する

- `docs/sites/README.md` の表（規約の確認日・改定日・根拠）
- 購入の流れを調べたら `docs/sites/<id>.md`（Cookie やトークンの実値は書かない）
- 設計の判断があれば ADR
