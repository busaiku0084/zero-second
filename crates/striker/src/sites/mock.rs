//! テスト・ローカル検証用のモックサイト。

use async_trait::async_trait;

use crate::model::{PurchaseOutcome, Reservation};
use crate::site::{SiteError, TicketSite};

pub struct MockSite;

#[async_trait]
impl TicketSite for MockSite {
    fn id(&self) -> &'static str {
        "mock"
    }

    async fn login(&self) -> Result<(), SiteError> {
        Ok(())
    }

    async fn prepare(&self, _reservation: &Reservation) -> Result<(), SiteError> {
        Ok(())
    }

    async fn purchase(&self, reservation: &Reservation) -> Result<PurchaseOutcome, SiteError> {
        Ok(PurchaseOutcome {
            order_id: format!("mock-{}", reservation.id),
            payment_reference: None,
            payment_due_at_ms: None,
        })
    }
}
