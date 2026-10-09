//! 検証用のモックサイト（apps/mock-site）で購入するアダプタ（ADR 0012, 0022）。
//!
//! **API（`api.rs`）とブラウザ操作（`browser.rs`）の両方に対応し、新しいサイトのアダプタの骨格の見本を兼ねる。**
//! 既定は API。`STRIKER_DRIVERS=mock=browser` でブラウザ操作に切り替わる。
//! どちらも同じ段階を踏む（docs/development/adding-a-site.md「アダプタの骨格」）:
//!
//! | 段階 | API | ブラウザ操作 |
//! |---|---|---|
//! | login | `POST /api/login` | `/login` の画面で ID・パスワードを入れて送る |
//! | prepare | `GET /api/events/{id}` で席種と枚数の上限を確かめる | 公演ページを開き、席種と枚数を選んでおく |
//! | purchase | `POST /api/events/{id}/orders` | 「購入する」を押し、結果の画面を読む |
//!
//! 送り先は設定の `MOCK_SITE_URL` だけ。予約の公演 URL（`http://127.0.0.1:47302/events/{シナリオ}`）からは
//! シナリオだけを読み、ホストは使わない。誤って外部のサイトへ送らないよう、`MOCK_SITE_URL` は
//! ループバックか、ドットを含まないホスト名（Docker のサービス名）に限る。

mod api;
mod browser;

use async_trait::async_trait;
use reqwest::Url;

use crate::model::{PurchaseOutcome, Reservation};
use crate::site::{Driver, SiteContext, SiteError, TicketSite};

pub struct MockSite {
    /// `http://127.0.0.1:47302` / Docker では `http://mock-site:...`（末尾の / なし）
    origin: String,
}

impl MockSite {
    pub fn new(base_url: &str) -> anyhow::Result<Self> {
        Ok(Self {
            origin: super::local_origin(base_url, "MOCK_SITE_URL")?,
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.origin)
    }
}

/// 公演 URL（`.../events/{シナリオ}`）からシナリオを取り出す
fn event_id(event_url: &str) -> Result<String, SiteError> {
    let url = Url::parse(event_url)
        .map_err(|e| anyhow::anyhow!("公演 URL を読めません: {event_url}: {e}"))?;
    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let ["events", id] = segments.as_slice() else {
        return Err(anyhow::anyhow!(
            "公演 URL は /events/{{シナリオ}} の形にしてください: {event_url}"
        )
        .into());
    };
    Ok((*id).to_string())
}

/// 席種がない: 予約の入力の間違いなので、販売開始を待たずに止める
fn unknown_ticket_type(ticket_type: &str, available: &[String]) -> SiteError {
    SiteError::Other(anyhow::anyhow!(
        "席種「{ticket_type}」がありません（選べる席種: {}）",
        available.join("、")
    ))
}

/// 枚数が 1 回の注文の上限を超えている: 購入上限は回避せず、人に回す（CLAUDE.md「守るライン」）
fn over_limit(quantity: u32, max: u32) -> SiteError {
    SiteError::HumanActionRequired(format!(
        "枚数（{quantity} 枚）が 1 回の注文の上限（{max} 枚）を超えています"
    ))
}

#[async_trait]
impl TicketSite for MockSite {
    fn id(&self) -> &'static str {
        "mock"
    }

    /// 既定は API（速い）。画面での購入も持つので、ブラウザ操作にも切り替えられる
    fn drivers(&self) -> &'static [Driver] {
        &[Driver::Http, Driver::Browser]
    }

    fn clock_probe_url(&self, _reservation: &Reservation) -> Option<String> {
        Some(self.url("/"))
    }

    async fn login(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        match ctx.driver {
            Driver::Http => api::login(self, ctx).await,
            Driver::Browser => browser::login(self, ctx).await,
        }
    }

    async fn prepare(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        match ctx.driver {
            Driver::Http => api::prepare(self, ctx).await,
            Driver::Browser => browser::prepare(self, ctx).await,
        }
    }

    async fn purchase(
        &self,
        ctx: &mut SiteContext,
        attempt: u32,
    ) -> Result<PurchaseOutcome, SiteError> {
        match ctx.driver {
            Driver::Http => api::purchase(self, ctx).await,
            Driver::Browser => browser::purchase(self, ctx, attempt).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_local_base_urls() {
        for url in [
            "http://127.0.0.1:47302",
            "http://localhost:47302/",
            "http://[::1]:47302",
            "http://mock-site:47302",
        ] {
            assert!(MockSite::new(url).is_ok(), "{url}");
        }
        assert_eq!(
            MockSite::new("http://mock-site:47302/")
                .unwrap()
                .url("/api/login"),
            "http://mock-site:47302/api/login"
        );
    }

    #[test]
    fn refuses_external_base_urls() {
        for url in [
            "https://ticketdive.com",
            "http://192.168.0.10:47302",
            "http://127.0.0.1.example.com",
            "not a url",
        ] {
            assert!(MockSite::new(url).is_err(), "{url}");
        }
    }

    #[test]
    fn reads_scenario_from_event_url() {
        assert_eq!(
            event_id("http://127.0.0.1:47302/events/sold-out").unwrap(),
            "sold-out"
        );
        assert_eq!(event_id("http://localhost/events/ok/").unwrap(), "ok");
        assert!(event_id("http://127.0.0.1:47302/").is_err());
        assert!(event_id("http://127.0.0.1:47302/foo/ok").is_err());
    }

    #[test]
    fn supports_both_drivers_with_http_first() {
        let site = MockSite::new("http://127.0.0.1:47302").unwrap();
        assert_eq!(site.drivers(), &[Driver::Http, Driver::Browser]);
    }

    #[test]
    fn over_limit_needs_a_human() {
        assert!(matches!(
            over_limit(5, 4),
            SiteError::HumanActionRequired(_)
        ));
        assert!(
            unknown_ticket_type("S席", &["一般".into(), "前方エリア".into()])
                .to_string()
                .contains("一般、前方エリア")
        );
    }
}
