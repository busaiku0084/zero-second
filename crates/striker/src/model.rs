//! ワーカー内で扱うドメインモデル。DB スキーマ（db/migrations）と
//! packages/shared/src/schemas.ts の値と対応させる。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reservation {
    pub id: i64,
    pub account_id: Option<i64>,
    pub site: String,
    pub title: String,
    pub event_url: String,
    pub ticket_type: String,
    pub quantity: u32,
    pub payment_method: String,
    /// 販売開始時刻（UNIX ミリ秒）
    pub sale_starts_at_ms: i64,
}

/// reservations.status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReservationStatus {
    Running,
    Succeeded,
    Failed,
    NeedsHuman,
}

impl ReservationStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::NeedsHuman => "needs_human",
        }
    }
}

/// runs.result
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunResult {
    Succeeded,
    SoldOut,
    Failed,
    NeedsHuman,
}

impl RunResult {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Succeeded => "succeeded",
            Self::SoldOut => "sold_out",
            Self::Failed => "failed",
            Self::NeedsHuman => "needs_human",
        }
    }

    /// 実行結果に合わせた予約の状態
    pub fn reservation_status(self) -> ReservationStatus {
        match self {
            Self::Succeeded => ReservationStatus::Succeeded,
            Self::SoldOut | Self::Failed => ReservationStatus::Failed,
            Self::NeedsHuman => ReservationStatus::NeedsHuman,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PurchaseOutcome {
    pub order_id: String,
    /// コンビニ払いの払込番号など、支払いに必要な情報
    pub payment_reference: Option<String>,
    /// 支払期限（UNIX ミリ秒）
    pub payment_due_at_ms: Option<i64>,
}

/// 実行の終わりに runs へ書く内容
#[derive(Debug, Clone)]
pub struct RunFinish {
    pub result: RunResult,
    pub finished_at_ms: i64,
    pub clock_offset_ms: Option<i64>,
    pub error: Option<String>,
    pub outcome: Option<PurchaseOutcome>,
}
