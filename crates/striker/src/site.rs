//! サイトごとのアダプタが実装する trait。
//!
//! アダプタを追加する前に、必ず .claude/skills/new-site-adapter の手順で利用規約を確認する（ADR 0005）。

use async_trait::async_trait;
use thiserror::Error;

use crate::http::TimedClient;
use crate::model::{PurchaseOutcome, Reservation};

#[derive(Debug, Error)]
pub enum SiteError {
    /// CAPTCHA・待機列・購入上限など、人の対応が必要な状態。回避せずに停止して通知する。
    #[error("人の対応が必要です: {0}")]
    HumanActionRequired(String),
    #[error("売り切れ")]
    SoldOut,
    /// 通信エラーなど。RetryPolicy の範囲で再試行する
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

/// ログイン情報（復号済み）。ログや DB に書かない
#[expect(dead_code, reason = "TODO(#4): ログインに対応したアダプタで使う")]
pub struct Credentials {
    pub login_id: String,
    pub password: String,
}

impl std::fmt::Debug for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Credentials")
            .field("login_id", &self.login_id)
            .field("password", &"***")
            .finish()
    }
}

/// 1 回の実行のあいだ、アダプタが使う状態
pub struct SiteContext {
    pub reservation: Reservation,
    pub http: TimedClient,
    #[expect(dead_code, reason = "TODO(#4): ログインに対応したアダプタで使う")]
    pub credentials: Option<Credentials>,
}

#[async_trait]
pub trait TicketSite: Send + Sync {
    /// サイト識別子（packages/shared/src/sites.ts の id と一致させる）
    fn id(&self) -> &'static str;

    /// サーバー時刻を測るための URL（Date ヘッダーを返すもの）。None なら端末の時計を使う
    fn clock_probe_url(&self, _reservation: &Reservation) -> Option<String> {
        None
    }

    /// セッションを確立する。販売開始前に呼ぶ。
    async fn login(&self, ctx: &mut SiteContext) -> Result<(), SiteError>;

    /// 販売開始前に取得できる情報を事前に揃え、接続を温めておく。
    async fn prepare(&self, ctx: &mut SiteContext) -> Result<(), SiteError>;

    /// 販売開始時刻に呼ばれ、購入を確定する。`attempt` は 1 始まりの試行回数。
    async fn purchase(
        &self,
        ctx: &mut SiteContext,
        attempt: u32,
    ) -> Result<PurchaseOutcome, SiteError>;
}
