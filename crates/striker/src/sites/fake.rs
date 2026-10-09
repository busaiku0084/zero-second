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

#[derive(Default)]
pub struct FakeSite {
    pub behavior: FakeBehavior,
}

#[async_trait]
impl TicketSite for FakeSite {
    fn id(&self) -> &'static str {
        "fake"
    }

    async fn login(&self, _ctx: &mut SiteContext) -> Result<(), SiteError> {
        tokio::time::sleep(Duration::from_millis(1)).await;
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
