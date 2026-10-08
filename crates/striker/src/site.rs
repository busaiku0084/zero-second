//! サイトごとのアダプタが実装する trait。

use async_trait::async_trait;
use thiserror::Error;

use crate::model::{PurchaseOutcome, Reservation};

#[derive(Debug, Error)]
pub enum SiteError {
    /// CAPTCHA・待機列・購入上限など、人の対応が必要な状態。回避せずに停止して通知する。
    #[error("human action required: {0}")]
    HumanActionRequired(String),
    #[error("sold out")]
    SoldOut,
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

#[async_trait]
pub trait TicketSite: Send + Sync {
    /// サイト識別子（DB の reservations.site と一致させる）
    fn id(&self) -> &'static str;

    /// セッションを確立する。販売開始前に呼ぶ。
    async fn login(&self) -> Result<(), SiteError>;

    /// 販売開始前に取得できる情報を事前に揃え、接続を温めておく。
    async fn prepare(&self, reservation: &Reservation) -> Result<(), SiteError>;

    /// 販売開始時刻に呼ばれ、購入を確定する。
    async fn purchase(&self, reservation: &Reservation) -> Result<PurchaseOutcome, SiteError>;
}
