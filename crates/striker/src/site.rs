//! サイトごとのアダプタが実装する trait。
//!
//! アダプタを追加する前に、必ず .claude/skills/new-site-adapter の手順で利用規約を確認する（ADR 0005）。

use async_trait::async_trait;
use thiserror::Error;

use crate::browser::BrowserSession;
use crate::http::TimedClient;
use crate::model::{PurchaseOutcome, Reservation};
use crate::retry::RetryPolicy;

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

/// アダプタがサイトを操作する方法（ADR 0021, 0022）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Driver {
    /// サイトの API を HTTP で叩く（`ctx.http`）。速いので、使えるならこちら
    Http,
    /// ヘッドレス Chrome で画面を操作する（`ctx.browser`）。API が使えないサイト用
    Browser,
}

impl Driver {
    /// 設定（`STRIKER_DRIVERS`）と DB（`runs.driver`）での表記
    pub fn as_str(self) -> &'static str {
        match self {
            Driver::Http => "http",
            Driver::Browser => "browser",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "http" => Some(Driver::Http),
            "browser" => Some(Driver::Browser),
            _ => None,
        }
    }
}

/// 1 回の実行のあいだ、アダプタが使う状態
pub struct SiteContext {
    pub reservation: Reservation,
    /// 今回の実行で使う操作の方法。アダプタはこれを見て API とブラウザ操作の処理を切り替える
    pub driver: Driver,
    pub http: TimedClient,
    /// `driver` が `Driver::Browser` のときだけ入る
    pub browser: Option<BrowserSession>,
    /// 予約に指定したアカウントのログイン情報（復号済み）。アカウントを指定していなければ None
    pub credentials: Option<Credentials>,
    /// prepare で読んでおき、purchase で使う値（販売開始の瞬間の処理を減らすため）
    pub prepared: std::collections::HashMap<&'static str, String>,
}

#[async_trait]
pub trait TicketSite: Send + Sync {
    /// サイト識別子（packages/shared/src/sites.json の id と一致させる）
    fn id(&self) -> &'static str;

    /// 購入の再試行の上限。サイトの負荷や規約に合わせて、既定より厳しくしてよい（緩める場合は理由を残す）
    fn retry_policy(&self) -> RetryPolicy {
        RetryPolicy::default()
    }

    /// 対応している操作の方法。先頭が既定で、`STRIKER_DRIVERS` で別の方法に切り替えられる（ADR 0022）。
    /// 両方に対応するアダプタは、login / prepare / purchase の中で `ctx.driver` を見て処理を分ける
    fn drivers(&self) -> &'static [Driver] {
        &[Driver::Http]
    }

    /// ログインにアカウント（ID とパスワード）が要るか。true なら、アカウントのない予約は login の前に失敗にする
    fn requires_credentials(&self) -> bool {
        false
    }

    /// サーバー時刻を測るための URL（Date ヘッダーを返すもの）。None なら端末の時計を使う。
    /// 販売開始の 0.5 秒前まで送るので、同じホストなら接続を温める役目も兼ねる
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

impl SiteContext {
    /// ブラウザ操作モードのブラウザ。`Driver::Browser` のアダプタ以外で呼ぶとエラー
    pub fn browser(&mut self) -> Result<&mut BrowserSession, SiteError> {
        self.browser.as_mut().ok_or_else(|| {
            SiteError::Other(anyhow::anyhow!(
                "ブラウザが起動していません（ctx.driver が Browser のときだけ使えます）"
            ))
        })
    }

    /// 段階を切り替える（HTTP とブラウザの両方の計測に反映する）
    pub fn set_phase(&mut self, phase: crate::metrics::Phase) {
        self.http.phase = phase;
        if let Some(b) = self.browser.as_mut() {
            b.phase = phase;
        }
    }
}
