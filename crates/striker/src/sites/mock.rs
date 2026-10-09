//! 検証用のモックサイト（apps/mock-site）で購入するアダプタ（ADR 0012）。
//!
//! 送り先は設定の `MOCK_SITE_URL` だけ。予約の公演 URL（`http://127.0.0.1:47302/events/{シナリオ}`）からは
//! シナリオだけを読み、ホストは使わない。誤って外部のサイトへ送らないよう、`MOCK_SITE_URL` は
//! ループバックか、ドットを含まないホスト名（Docker のサービス名）に限る。

use std::net::IpAddr;

use async_trait::async_trait;
use reqwest::{Response, StatusCode, Url};
use serde::Deserialize;
use serde_json::json;

use crate::model::{PurchaseOutcome, Reservation};
use crate::site::{SiteContext, SiteError, TicketSite};

pub struct MockSite {
    /// `http://127.0.0.1:47302` / Docker では `http://mock-site:...`（末尾の / なし）
    origin: String,
}

impl MockSite {
    pub fn new(base_url: &str) -> anyhow::Result<Self> {
        let url = Url::parse(base_url)
            .map_err(|e| anyhow::anyhow!("MOCK_SITE_URL を読めません: {base_url}: {e}"))?;
        let local = match url.host_str() {
            Some(host) => match host
                .trim_start_matches('[')
                .trim_end_matches(']')
                .parse::<IpAddr>()
            {
                Ok(ip) => ip.is_loopback(),
                // localhost や Docker のサービス名（mock-site）。ドメイン名は外部とみなす
                Err(_) => !host.contains('.'),
            },
            None => false,
        };
        if !local {
            anyhow::bail!(
                "MOCK_SITE_URL はループバックか Docker のサービス名にしてください: {base_url}"
            );
        }
        Ok(Self {
            origin: url.origin().ascii_serialization(),
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderResponse {
    order_id: String,
    payment_reference: Option<String>,
    payment_due_at_ms: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
struct ErrorResponse {
    error: Option<String>,
}

/// 購入の失敗を SiteError にする。売り切れと CAPTCHA 以外は再試行の対象
fn order_error(status: StatusCode, code: Option<&str>) -> SiteError {
    match (status, code) {
        (StatusCode::CONFLICT, Some("sold_out")) => SiteError::SoldOut,
        (StatusCode::FORBIDDEN, Some("captcha_required")) => {
            SiteError::HumanActionRequired("CAPTCHA が表示されました".into())
        }
        _ => SiteError::Other(anyhow::anyhow!(
            "購入できませんでした: HTTP {} {}",
            status.as_u16(),
            code.unwrap_or("")
        )),
    }
}

async fn send(
    ctx: &mut SiteContext,
    request: reqwest::RequestBuilder,
) -> Result<Response, SiteError> {
    let request = request.build().map_err(anyhow::Error::from)?;
    Ok(ctx
        .http
        .execute(request)
        .await
        .map_err(anyhow::Error::from)?)
}

/// 成功以外の応答をエラーにする（login / prepare 用）
async fn expect_success(response: Response, what: &str) -> Result<Response, SiteError> {
    if response.status().is_success() {
        return Ok(response);
    }
    Err(anyhow::anyhow!("{what}に失敗しました: HTTP {}", response.status().as_u16()).into())
}

#[async_trait]
impl TicketSite for MockSite {
    fn id(&self) -> &'static str {
        "mock"
    }

    fn clock_probe_url(&self, _reservation: &Reservation) -> Option<String> {
        Some(self.url("/"))
    }

    async fn login(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        let request = ctx
            .http
            .inner()
            .post(self.url("/api/login"))
            .json(&json!({}));
        let response = send(ctx, request).await?;
        expect_success(response, "ログイン").await?;
        Ok(())
    }

    async fn prepare(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        let id = event_id(&ctx.reservation.event_url)?;
        let request = ctx.http.inner().get(self.url(&format!("/api/events/{id}")));
        let response = send(ctx, request).await?;
        expect_success(response, "公演情報の取得").await?;
        Ok(())
    }

    async fn purchase(
        &self,
        ctx: &mut SiteContext,
        _attempt: u32,
    ) -> Result<PurchaseOutcome, SiteError> {
        let id = event_id(&ctx.reservation.event_url)?;
        let body = json!({
            "ticketType": ctx.reservation.ticket_type,
            "quantity": ctx.reservation.quantity,
            "paymentMethod": ctx.reservation.payment_method,
        });
        let request = ctx
            .http
            .inner()
            .post(self.url(&format!("/api/events/{id}/orders")))
            .json(&body);
        let response = send(ctx, request).await?;
        let status = response.status();
        if !status.is_success() {
            let error: ErrorResponse = response.json().await.unwrap_or_default();
            return Err(order_error(status, error.error.as_deref()));
        }
        let order: OrderResponse = response
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("注文の応答を読めません: {e}"))?;
        Ok(PurchaseOutcome {
            order_id: order.order_id,
            payment_reference: order.payment_reference,
            payment_due_at_ms: order.payment_due_at_ms,
        })
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
    fn maps_order_errors() {
        assert!(matches!(
            order_error(StatusCode::CONFLICT, Some("sold_out")),
            SiteError::SoldOut
        ));
        assert!(matches!(
            order_error(StatusCode::FORBIDDEN, Some("captcha_required")),
            SiteError::HumanActionRequired(_)
        ));
        assert!(matches!(
            order_error(
                StatusCode::SERVICE_UNAVAILABLE,
                Some("temporarily_unavailable")
            ),
            SiteError::Other(_)
        ));
    }
}
