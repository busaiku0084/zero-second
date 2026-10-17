//! モックサイトを画面の操作で買う。ブラウザ操作のアダプタの骨格の見本（ADR 0021, 0022）。
//!
//! - 操作は必ず `ctx.browser()?` の goto / fill / select / click / wait_for_any で行う。操作ごとに timings に残る
//! - セレクタは変わりにくいもの（`data-test` 属性や id）を使う
//! - 待ち時間はすべて上限つき。成功の画面とエラーの表示は `wait_for_any` で同時に待ち、どれが出たかで振り分ける
//!   （CAPTCHA・待機列は回避せず `HumanActionRequired` で止める）
//! - prepare で購入ボタンの手前（席種・枚数を選んだ状態）まで進め、販売開始の瞬間はボタン 1 回にする

use std::time::Duration;

use super::{MockSite, event_id, over_limit, unknown_ticket_type};
use crate::model::PurchaseOutcome;
use crate::site::{SiteContext, SiteError};

/// 画面の要素が出るまでの待ち時間の上限
const TIMEOUT: Duration = Duration::from_secs(10);

/// data-test 属性のセレクタ
fn t(id: &str) -> String {
    format!("[data-test=\"{id}\"]")
}

/// 1. ログイン。ログインの画面で ID・パスワードを入れて送り、ログイン中の印かエラーの表示を待つ
pub(super) async fn login(site: &MockSite, ctx: &mut SiteContext) -> Result<(), SiteError> {
    let credentials = ctx
        .credentials
        .as_ref()
        .map(|c| (c.login_id.clone(), c.password.clone()));
    let url = site.url("/login");
    let browser = ctx.browser()?;
    browser.goto(&url).await?;
    // アカウントは任意（モックは locked 以外のどの値でも受け付ける）。指定があれば入れる
    if let Some((login_id, password)) = credentials {
        browser.fill(&t("login-id"), &login_id, TIMEOUT).await?;
        browser.fill(&t("password"), &password, TIMEOUT).await?;
    }
    browser.click(&t("login-button"), TIMEOUT).await?;
    // ログイン中の印が出れば成功。エラーが出たら、その文言を含めて止める
    let shown = browser
        .wait_for_any(&[&t("account"), &t("login-error")], TIMEOUT)
        .await?;
    if shown == 1 {
        let message = browser.text(&t("login-error")).await.unwrap_or_default();
        return Err(SiteError::Other(anyhow::anyhow!(
            "ログインできません: {message}"
        )));
    }
    Ok(())
}

/// 2. 準備。公演ページを開き、席種と枚数を選んで「購入する」の手前で止める
pub(super) async fn prepare(site: &MockSite, ctx: &mut SiteContext) -> Result<(), SiteError> {
    open_order_form(site, ctx).await
}

/// 3. 購入。「購入する」を押し、結果の画面（完了・売り切れ・CAPTCHA・待機列・エラー）を読む
pub(super) async fn purchase(
    site: &MockSite,
    ctx: &mut SiteContext,
    attempt: u32,
) -> Result<PurchaseOutcome, SiteError> {
    // 再試行のときは前の試行の結果の画面にいるので、公演ページから選び直す
    if attempt > 1 {
        open_order_form(site, ctx).await?;
    }
    let browser = ctx.browser()?;
    browser.click(&t("purchase"), TIMEOUT).await?;
    let shown = browser
        .wait_for_any(
            &[
                &t("order-id"),
                &t("sold-out"),
                &t("captcha"),
                &t("queue"),
                &t("error"),
            ],
            TIMEOUT,
        )
        .await?;
    match shown {
        0 => {
            let order_id = browser
                .text(&t("order-id"))
                .await
                .ok_or_else(|| anyhow::anyhow!("注文番号を読めません"))?;
            Ok(PurchaseOutcome {
                order_id,
                payment_reference: browser.text(&t("payment-reference")).await,
                payment_due_at_ms: browser
                    .attribute(&t("payment-due"), "data-ms")
                    .await
                    .and_then(|v| v.parse().ok()),
            })
        }
        1 => Err(SiteError::SoldOut),
        2 => Err(SiteError::HumanActionRequired(
            "CAPTCHA が表示されました".into(),
        )),
        3 => Err(SiteError::HumanActionRequired("待機列に入りました".into())),
        // 混雑など。文言をそのままエラーに含める（RetryPolicy の範囲で再試行される）
        _ => {
            let message = browser.text(&t("error")).await.unwrap_or_default();
            Err(SiteError::Other(anyhow::anyhow!(
                "購入できませんでした: {message}"
            )))
        }
    }
}

/// 公演ページを開き、予約の席種と枚数を選ぶ
async fn open_order_form(site: &MockSite, ctx: &mut SiteContext) -> Result<(), SiteError> {
    let id = event_id(&ctx.reservation.event_url)?;
    let url = site.url(&format!("/events/{id}"));
    let ticket_type = ctx.reservation.ticket_type.clone();
    let quantity = ctx.reservation.quantity;
    let browser = ctx.browser()?;

    browser.goto(&url).await?;
    let shown = browser
        .wait_for_any(&[&t("purchase-form"), &t("login-link")], TIMEOUT)
        .await?;
    if shown == 1 {
        return Err(SiteError::Other(anyhow::anyhow!(
            "ログインが切れています（購入フォームが表示されません）"
        )));
    }
    if let Err(available) = browser
        .select(&t("ticket-type"), &ticket_type, TIMEOUT)
        .await?
    {
        return Err(unknown_ticket_type(&ticket_type, &available));
    }
    if let Err(available) = browser
        .select(&t("quantity"), &quantity.to_string(), TIMEOUT)
        .await?
    {
        return Err(over_limit(quantity, available.len() as u32));
    }
    Ok(())
}
