//! テスト・ローカル検証用のモックサイト。外部にはアクセスしない。

use std::time::Duration;

use async_trait::async_trait;

use crate::model::PurchaseOutcome;
use crate::site::{SiteContext, SiteError, TicketSite};

/// 購入時の振る舞い（テストで切り替える）
#[cfg_attr(not(test), expect(dead_code, reason = "テストでだけ切り替える"))]
#[derive(Debug, Clone, Copy, Default)]
pub enum MockBehavior {
    #[default]
    Succeed,
    SoldOut,
    NeedsHuman,
    /// 指定回数だけ一時的なエラーを返してから成功する
    FailTimes(u32),
}

#[derive(Default)]
pub struct MockSite {
    pub behavior: MockBehavior,
}

#[async_trait]
impl TicketSite for MockSite {
    fn id(&self) -> &'static str {
        "mock"
    }

    async fn login(&self, _ctx: &mut SiteContext) -> Result<(), SiteError> {
        tokio::time::sleep(Duration::from_millis(5)).await;
        Ok(())
    }

    async fn prepare(&self, _ctx: &mut SiteContext) -> Result<(), SiteError> {
        tokio::time::sleep(Duration::from_millis(5)).await;
        Ok(())
    }

    async fn purchase(
        &self,
        ctx: &mut SiteContext,
        attempt: u32,
    ) -> Result<PurchaseOutcome, SiteError> {
        tokio::time::sleep(Duration::from_millis(5)).await;
        match self.behavior {
            MockBehavior::SoldOut => Err(SiteError::SoldOut),
            MockBehavior::NeedsHuman => Err(SiteError::HumanActionRequired(
                "CAPTCHA が表示されました".into(),
            )),
            MockBehavior::FailTimes(n) if attempt <= n => Err(SiteError::Other(anyhow::anyhow!(
                "一時的なエラー（{attempt} 回目）"
            ))),
            _ => Ok(PurchaseOutcome {
                order_id: format!("mock-{}", ctx.reservation.id),
                payment_reference: Some("0000-0000-0000".into()),
                payment_due_at_ms: None,
            }),
        }
    }
}
