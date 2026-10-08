//! ワーカー内で扱うドメインモデル。DB スキーマ（db/migrations）と対応する。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reservation {
    pub id: i64,
    pub site: String,
    pub event_url: String,
    pub ticket_type: String,
    pub quantity: u32,
    pub payment_method: PaymentMethod,
    /// 販売開始時刻（UNIX ミリ秒）
    pub sale_starts_at_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentMethod {
    ConvenienceStore,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseOutcome {
    pub order_id: String,
    /// コンビニ払いの払込番号など、支払いに必要な情報
    pub payment_reference: Option<String>,
    /// 支払期限（UNIX ミリ秒）
    pub payment_due_at_ms: Option<i64>,
}
