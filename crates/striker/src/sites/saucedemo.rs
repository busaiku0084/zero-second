//! Sauce Demo（Swag Labs）で購入するアダプタ。ブラウザ操作モードの見本（ADR 0021）。
//!
//! Sauce Demo は Sauce Labs がテスト自動化の題材として公開しているサンプルのショップ（MIT ライセンス）。
//! 公開サイト（saucedemo.com）には送らず、ローカルの Docker で動かしたもの（`SAUCE_DEMO_URL`）だけを使う。
//! 実際の決済や注文は起きない。
//!
//! 予約との対応:
//! - 公演 URL: 商品ページ（`http://127.0.0.1:47303/inventory-item.html?id=4`）。読むのは `id` だけ
//! - アカウント: Sauce Demo のテストユーザー（standard_user など。パスワードは画面に書かれている secret_sauce）
//! - 枚数: 1 のみ（同じ商品は 1 点しかカートに入らない）
//!
//! 準備（prepare）で注文の確認画面まで進めておき、販売開始の瞬間は「Finish」を押すだけにする。

use std::time::Duration;

use async_trait::async_trait;
use reqwest::Url;

use crate::clock::now_ms;
use crate::model::{PurchaseOutcome, Reservation};
use crate::retry::RetryPolicy;
use crate::site::{Driver, SiteContext, SiteError, TicketSite};

/// 画面の要素が出るまでの待ち時間の上限
const TIMEOUT: Duration = Duration::from_secs(10);
/// performance_glitch_user はログインに 5 秒ほどかかるので、ログインだけ長めに待つ
const LOGIN_TIMEOUT: Duration = Duration::from_secs(20);

/// data-test 属性のセレクタ
fn t(id: &str) -> String {
    format!("[data-test=\"{id}\"]")
}

pub struct SauceDemoSite {
    /// `http://127.0.0.1:47303` / Docker では `http://saucedemo:47303`
    origin: String,
}

impl SauceDemoSite {
    pub fn new(base_url: &str) -> anyhow::Result<Self> {
        Ok(Self {
            origin: super::local_origin(base_url, "SAUCE_DEMO_URL")?,
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.origin)
    }
}

/// 商品ページの URL から商品の id を読む
pub fn item_id(event_url: &str) -> Result<u32, SiteError> {
    let url = Url::parse(event_url)
        .map_err(|e| anyhow::anyhow!("公演 URL を読めません: {event_url}: {e}"))?;
    url.query_pairs()
        .find(|(k, _)| k == "id")
        .and_then(|(_, v)| v.parse().ok())
        .ok_or_else(|| {
            SiteError::Other(anyhow::anyhow!(
                "商品ページの URL（inventory-item.html?id=数字）を指定してください: {event_url}"
            ))
        })
}

#[async_trait]
impl TicketSite for SauceDemoSite {
    fn id(&self) -> &'static str {
        "saucedemo"
    }

    /// Sauce Demo は画面だけのサイト（API がない）
    fn drivers(&self) -> &'static [Driver] {
        &[Driver::Browser]
    }

    fn requires_credentials(&self) -> bool {
        true
    }

    /// 画面の操作はやり直すと状態がずれやすいので、再試行は 1 回まで
    fn retry_policy(&self) -> RetryPolicy {
        RetryPolicy {
            max_attempts: 2,
            ..RetryPolicy::default()
        }
    }

    fn clock_probe_url(&self, _reservation: &Reservation) -> Option<String> {
        Some(self.url("/"))
    }

    async fn login(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        let (login_id, password) = match &ctx.credentials {
            Some(c) => (c.login_id.clone(), c.password.clone()),
            None => return Err(SiteError::Other(anyhow::anyhow!("アカウントがありません"))),
        };
        let url = self.url("/");
        let browser = ctx.browser()?;
        browser.goto(&url).await?;
        browser.fill(&t("username"), &login_id, TIMEOUT).await?;
        browser.fill(&t("password"), &password, TIMEOUT).await?;
        browser.click(&t("login-button"), TIMEOUT).await?;
        // 商品一覧が出れば成功。エラー（ロックされたユーザーなど）が出たら止める
        let shown = browser
            .wait_for_any(&[&t("inventory-list"), &t("error")], LOGIN_TIMEOUT)
            .await?;
        if shown == 1 {
            let message = browser.text(&t("error")).await.unwrap_or_default();
            return Err(SiteError::Other(anyhow::anyhow!(
                "ログインできません: {message}"
            )));
        }
        Ok(())
    }

    /// カートに入れ、注文情報を入れて確認画面（Finish の手前）まで進める
    async fn prepare(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        if ctx.reservation.quantity != 1 {
            return Err(SiteError::Other(anyhow::anyhow!(
                "Sauce Demo は 1 点ずつしか買えません（枚数を 1 にしてください）"
            )));
        }
        let id = item_id(&ctx.reservation.event_url)?;
        let item_url = self.url(&format!("/inventory-item.html?id={id}"));
        let cart_url = self.url("/cart.html");
        let browser = ctx.browser()?;

        browser.goto(&item_url).await?;
        let shown = browser
            .wait_for_any(&[&t("add-to-cart"), &t("remove")], TIMEOUT)
            .await?;
        if shown == 0 {
            browser.click(&t("add-to-cart"), TIMEOUT).await?;
            // problem_user など、押しても入らない場合がある
            browser
                .wait_for(&t("remove"), Duration::from_secs(3))
                .await
                .map_err(|_| SiteError::Other(anyhow::anyhow!("カートに入れられませんでした")))?;
        }

        browser.goto(&cart_url).await?;
        browser.click(&t("checkout"), TIMEOUT).await?;
        browser.fill(&t("firstName"), "Zero", TIMEOUT).await?;
        browser.fill(&t("lastName"), "Second", TIMEOUT).await?;
        browser.fill(&t("postalCode"), "1000001", TIMEOUT).await?;
        browser.click(&t("continue"), TIMEOUT).await?;
        let shown = browser
            .wait_for_any(&[&t("finish"), &t("error")], TIMEOUT)
            .await?;
        if shown == 1 {
            let message = browser.text(&t("error")).await.unwrap_or_default();
            return Err(SiteError::Other(anyhow::anyhow!(
                "注文情報を入れられません: {message}"
            )));
        }
        // 合計金額は今のうちに読んでおく（販売開始の瞬間は Finish を押すだけにする）
        if let Some(total) = browser.text(&t("total-label")).await {
            ctx.prepared.insert("total", total);
        }
        Ok(())
    }

    /// 販売開始の瞬間に Finish を押し、完了画面を待つ
    async fn purchase(
        &self,
        ctx: &mut SiteContext,
        attempt: u32,
    ) -> Result<PurchaseOutcome, SiteError> {
        let reservation_id = ctx.reservation.id;
        let total = ctx.prepared.get("total").cloned();
        let browser = ctx.browser()?;
        // 再試行のときは、前の試行で完了していれば押し直さない
        if attempt == 1 || !browser.exists(&t("complete-header")).await {
            browser.click(&t("finish"), TIMEOUT).await?;
            browser.wait_for(&t("complete-header"), TIMEOUT).await?;
        }
        Ok(outcome(reservation_id, total))
    }
}

/// Sauce Demo には注文番号がないので、予約と時刻から作る。合計金額は払込情報の欄に残す
fn outcome(reservation_id: i64, total: Option<String>) -> PurchaseOutcome {
    PurchaseOutcome {
        order_id: format!("SAUCE-{reservation_id}-{}", now_ms()),
        payment_reference: total,
        payment_due_at_ms: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_item_id_from_product_url() {
        assert_eq!(
            item_id("http://127.0.0.1:47303/inventory-item.html?id=4").unwrap(),
            4
        );
        assert!(item_id("http://127.0.0.1:47303/inventory.html").is_err());
        assert!(item_id("http://127.0.0.1:47303/inventory-item.html?id=x").is_err());
    }

    #[test]
    fn only_local_origins_are_accepted() {
        assert!(SauceDemoSite::new("http://127.0.0.1:47303").is_ok());
        assert!(SauceDemoSite::new("http://saucedemo:47303").is_ok());
        assert!(SauceDemoSite::new("https://www.saucedemo.com").is_err());
    }
}
