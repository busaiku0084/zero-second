//! テスト用のサイト。外部にもモックサイトにもアクセスせず、決めた振る舞いを返す。

use std::time::Duration;

use async_trait::async_trait;

use crate::model::PurchaseOutcome;
use crate::site::{SiteContext, SiteError, TicketSite};

/// 購入時の振る舞い
#[derive(Debug, Clone, Copy, Default)]
pub enum FakeBehavior {
    #[default]
    Succeed,
    SoldOut,
    NeedsHuman,
    /// 指定回数だけ一時的なエラーを返してから成功する
    FailTimes(u32),
}

pub struct FakeSite {
    /// 登録するサイト id（スケジューラのテストでは "mock" として登録する）
    pub id: &'static str,
    pub behavior: FakeBehavior,
    /// 設定すると、アカウントが必須になり、login でこのパスワードかを確かめる
    pub expected_password: Option<&'static str>,
}

impl Default for FakeSite {
    fn default() -> Self {
        Self {
            id: "fake",
            behavior: FakeBehavior::default(),
            expected_password: None,
        }
    }
}

#[async_trait]
impl TicketSite for FakeSite {
    fn id(&self) -> &'static str {
        self.id
    }

    fn requires_credentials(&self) -> bool {
        self.expected_password.is_some()
    }

    async fn login(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        tokio::time::sleep(Duration::from_millis(1)).await;
        if let Some(expected) = self.expected_password {
            let given = ctx.credentials.as_ref().map(|c| c.password.as_str());
            if given != Some(expected) {
                return Err(SiteError::Other(anyhow::anyhow!("ログインできません")));
            }
        }
        Ok(())
    }

    async fn prepare(&self, _ctx: &mut SiteContext) -> Result<(), SiteError> {
        tokio::time::sleep(Duration::from_millis(1)).await;
        Ok(())
    }

    async fn purchase(
        &self,
        ctx: &mut SiteContext,
        attempt: u32,
    ) -> Result<PurchaseOutcome, SiteError> {
        tokio::time::sleep(Duration::from_millis(1)).await;
        match self.behavior {
            FakeBehavior::SoldOut => Err(SiteError::SoldOut),
            FakeBehavior::NeedsHuman => Err(SiteError::HumanActionRequired(
                "CAPTCHA が表示されました".into(),
            )),
            FakeBehavior::FailTimes(n) if attempt <= n => Err(SiteError::Other(anyhow::anyhow!(
                "一時的なエラー（{attempt} 回目）"
            ))),
            _ => Ok(PurchaseOutcome {
                order_id: format!("fake-{}", ctx.reservation.id),
                payment_reference: Some("0000-0000-0000".into()),
                payment_due_at_ms: None,
            }),
        }
    }
}
