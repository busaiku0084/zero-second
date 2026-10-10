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
| `embeddable` | 省略可（既定 true）。公演ページの埋め込みをサイトが拒否するなら false にし、予約の登録画面では別ウィンドウで開く（[ADR 0024](../adr/0024-event-page-side-preview.md)） |

これだけで、予約フォームのサイトの選択肢・API の検証・一覧の表示名に反映される。

サイトに特有の準備（本人確認など）があれば、`packages/shared/src/checklist.ts` の購入前チェックリストのテンプレートにも足す。

## 2. アダプタを書く（`auto` のときだけ）

`crates/striker/src/sites/<id>.rs`（両方の方法に対応するなら `sites/<id>/mod.rs`・`api.rs`・`browser.rs`）に `TicketSite` を実装する。
見本は `sites/mock/`（API とブラウザ操作の両方）と `sites/saucedemo.rs`（ブラウザ操作だけ）。

### 2-1. 操作の方法を決める（[ADR 0021](../adr/0021-browser-mode.md)・[ADR 0022](../adr/0022-switchable-drivers-per-adapter.md)）

| 方法 | 使う場面 | 速さ | `drivers()` |
|---|---|---|---|
| API（`Driver::Http`） | 画面の裏で JSON などを返す API がある | 速い（購入はリクエスト 1 本） | `&[Driver::Http]`（既定） |
| ブラウザ操作（`Driver::Browser`） | 画面の操作でしか買えない | 遅い（Chrome の起動・描画を待つ） | `&[Driver::Browser]` |
| 両方 | API があるが、画面のほうが安定する場面もある | — | `&[Driver::Http, Driver::Browser]`（先頭が既定） |

両方に対応したアダプタは、ワーカーの設定 `STRIKER_DRIVERS=<id>=browser` で切り替える（予約の画面では選ばない）。
どちらで買ったかは `runs.driver` に残り、実行結果の画面に出る。

### 2-2. どちらの方法でも守ること

- **段階ごとにやることを分ける**。ワーカーは `login` → `prepare` → 時刻合わせ → 販売開始まで待つ → `purchase` の順に呼ぶ
  - `login` と `prepare` は販売開始の約 2 分前（`STRIKER_LEAD_MS`）。時間がかかる処理と、販売開始前に分かる間違いの確認はここで済ませる
  - `purchase` は販売開始の瞬間。**やることを最小にする**（API ならリクエスト 1 本、ブラウザならボタン 1 回）
  - `prepare` で読んだ値（席種の id、CSRF トークン、合計金額など）は `ctx.prepared` に入れて `purchase` で使う
- **エラーを 3 種類に振り分ける**（`SiteError`）。振り分けは純粋関数にして単体テストを書く

  | 状態 | 返すもの | ワーカーの動き |
  |---|---|---|
  | 売り切れ | `SiteError::SoldOut` | 再試行せずに終える |
  | CAPTCHA・待機列・購入上限・本人確認 | `SiteError::HumanActionRequired(理由)` | **回避せずに**止め、人に通知する |
  | 通信エラー・混雑（503 など） | `SiteError::Other(..)` | `retry_policy()` の範囲で再試行する |

- **送り先のホストを固定する**。予約の公演 URL からは公演の id だけを読み、ホストはアダプタの設定から取る
- **計測できるようにする**。API は必ず `ctx.http`（`TimedClient`）で送り、ブラウザは必ず `ctx.browser()?` のメソッドで操作する。どちらも `timings` に残る
- **ログイン情報を漏らさない**。`ctx.credentials` の値をログ・エラーメッセージ・`timings` の URL に入れない
- 必要なら `retry_policy()` で再試行を既定より厳しくする。`clock_probe_url()` でサーバー時刻を測れる URL を返す（同じホストへの接続を温める役目も兼ねる）。ログインが要るなら `requires_credentials()` で true を返す

### 2-3. API の骨格（見本: `sites/mock/api.rs`）

| 段階 | やること | 止める条件 |
|---|---|---|
| `login` | ログインの API に ID・パスワードを送る。Cookie は `ctx.http` が持ち続ける。トークンを返すサイトなら `ctx.prepared` に入れる | 認証の失敗 → `Other`（再試行されないよう、`prepare` までのエラーは即失敗） |
| `prepare` | 公演情報の API を読み、予約の席種が**あるか**・枚数が**上限以内か**を確かめる。席種の id や CSRF トークンなど、購入に要る値を `ctx.prepared` に入れる | ない席種 → `Other`、上限超え → `HumanActionRequired` |
| `purchase` | 注文の API に 1 本だけ送る。応答のステータスとエラーコードを `SiteError` に振り分ける | 上の表のとおり |

```rust
async fn login(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
    let c = ctx.credentials.as_ref().ok_or_else(|| anyhow!("アカウントがありません"))?;
    let body = json!({ "loginId": c.login_id, "password": c.password });
    let request = ctx.http.inner().post(self.url("/api/login")).json(&body).build()?;
    let response = ctx.http.execute(request).await?;   // timings に残る
    expect_success(response, "ログイン").await?;
    Ok(())
}

async fn prepare(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
    let event: Event = /* GET /api/events/{id} */;
    let ticket = event.find(&ctx.reservation.ticket_type).ok_or_else(|| unknown_ticket_type(..))?;
    if ctx.reservation.quantity > event.max_per_order { return Err(over_limit(..)); }
    ctx.prepared.insert("ticket_id", ticket.id.clone());  // 販売開始の瞬間に使う
    Ok(())
}

async fn purchase(&self, ctx: &mut SiteContext, _attempt: u32) -> Result<PurchaseOutcome, SiteError> {
    let response = /* POST /api/events/{id}/orders（ctx.prepared の値を使う） */;
    if !response.status().is_success() {
        return Err(order_error(response.status(), error_code)); // 純粋関数でテストする
    }
    Ok(PurchaseOutcome { order_id, payment_reference, payment_due_at_ms })
}
```

### 2-4. ブラウザ操作の骨格（見本: `sites/mock/browser.rs`・`sites/saucedemo.rs`）

`ctx.browser()?` のメソッドだけで操作する。どれも待ち時間の上限を取り、操作ごとに `timings` に残る（入力した値は残さない）。

| メソッド | 用途 | timings の method |
|---|---|---|
| `goto(url)` | ページを開く（URL と `document.readyState` を見て待つ。上限 15 秒） | `GOTO` |
| `fill(selector, value, timeout)` | 入力欄に入れる | `TYPE` |
| `select(selector, value, timeout)` | 選択肢を選ぶ。値か表示の文字列で探し、なければ選べる選択肢を返す | `SELECT` |
| `click(selector, timeout)` | 出るまで待って押す | `CLICK` |
| `wait_for(selector, timeout)` / `wait_for_any(&[..], timeout)` | 出るまで待つ / どれが出たかを返す | `WAIT` |
| `text(selector)` / `attribute(selector, name)` / `exists(selector)` | 読む（待たない） | — |

| 段階 | やること | 止める条件 |
|---|---|---|
| `login` | ログインの画面を開き、ID・パスワードを入れて送る。**ログイン中の印とエラーの表示を `wait_for_any` で同時に待つ** | エラーが出た → 文言を含めて `Other` |
| `prepare` | 公演ページを開き、席種と枚数を `select` で選び、**購入ボタンの手前で止める**。確認画面があるサイトなら、確定ボタンの手前まで進める | 選択肢にない席種 → `Other`、枚数の選択肢が足りない → `HumanActionRequired` |
| `purchase` | ボタンを 1 回押し、**完了・売り切れ・CAPTCHA・エラーの印を `wait_for_any` で同時に待つ**。完了なら注文番号などを読む | 出た印で振り分ける。再試行（`attempt > 1`）なら、前の結果の画面にいるので `prepare` と同じ手順で選び直してから押す |

```rust
async fn prepare(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
    let url = self.url(&format!("/events/{id}"));
    let browser = ctx.browser()?;
    browser.goto(&url).await?;
    if browser.wait_for_any(&[&t("purchase-form"), &t("login-link")], TIMEOUT).await? == 1 {
        return Err(anyhow!("ログインが切れています").into());
    }
    if let Err(available) = browser.select(&t("ticket-type"), &ticket_type, TIMEOUT).await? {
        return Err(unknown_ticket_type(&ticket_type, &available));
    }
    // 枚数も同じ。ここで止め、販売開始の瞬間は「購入する」を押すだけにする
    Ok(())
}

async fn purchase(&self, ctx: &mut SiteContext, attempt: u32) -> Result<PurchaseOutcome, SiteError> {
    if attempt > 1 { self.prepare(ctx).await?; }
    let browser = ctx.browser()?;
    browser.click(&t("purchase"), TIMEOUT).await?;
    match browser.wait_for_any(&[&t("order-id"), &t("sold-out"), &t("captcha"), &t("error")], TIMEOUT).await? {
        0 => Ok(PurchaseOutcome { order_id: browser.text(&t("order-id")).await.., .. }),
        1 => Err(SiteError::SoldOut),
        2 => Err(SiteError::HumanActionRequired("CAPTCHA が表示されました".into())),
        _ => Err(anyhow!("購入できませんでした: {}", browser.text(&t("error")).await..).into()),
    }
}
```

セレクタは変わりにくいもの（テスト用の `data-test` 属性や id）を使う。文言やクラス名（デザインで変わる）には頼らない。

### 2-5. 両方に対応する（見本: `sites/mock/mod.rs`）

`drivers()` で両方を返し、`TicketSite` の実装は `ctx.driver` で振り分けるだけにする。
席種がない・上限を超えるなど、方法によらないエラーの作り方は `mod.rs` に置いて両方から使う。

```rust
fn drivers(&self) -> &'static [Driver] { &[Driver::Http, Driver::Browser] }

async fn prepare(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
    match ctx.driver {
        Driver::Http => api::prepare(self, ctx).await,
        Driver::Browser => browser::prepare(self, ctx).await,
    }
}
```

### 2-6. 設定・登録・テスト

1. 接続先などの設定が要るなら、`config.rs` の `SitesConfig` に項目を足し、環境変数から読む（`.env.example`・`docs/operations.md` にも書く）
2. `sites/mod.rs` の `SiteRegistry::from_config` に 1 行足して登録する
3. 予約の登録画面の自動入力（公演名・席種・枚数の上限）に対応させる: `apps/api/src/lib/event-info.ts` の `resolveEventInfo` にサイトの読み方を足す。送り先は設定の接続先に固定する（[ADR 0023](../adr/0023-event-info-autofill.md)）
4. テストを書く。応答の解釈（`SiteError` への振り分け・席種と枚数の確認など）は純粋関数にして単体テストにする。記録した応答を使う場合は実値を伏せる
5. モックサイトのように自分で用意したサイトで、両方の方法を実際に動かす（`STRIKER_DRIVERS` で切り替える）

## 3. 確かめる

```bash
make check && make test
```

`sites::tests::auto_sites_and_adapters_match` が、sites.json の `automation: "auto"` と登録済みのアダプタが一致しているかを確かめる。片方だけ変えるとここで落ちる。

## 4. 記録する

- `docs/sites/README.md` の表（規約の確認日・改定日・根拠）
- 購入の流れを調べたら `docs/sites/<id>.md`（Cookie やトークンの実値は書かない）
- 設計の判断があれば ADR
