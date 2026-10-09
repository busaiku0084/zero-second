//! 検証用のモックサイト（apps/mock-site）で購入するアダプタ（ADR 0012）。
//!
//! 予約の公演 URL（`http://127.0.0.1:8788/events/{シナリオ}`）のオリジンへ、実際に HTTP で送る。
//! 誤って外部のサイトへ送らないよう、ループバックのアドレス以外は拒否する。

use std::net::IpAddr;

use async_trait::async_trait;
use reqwest::{Response, StatusCode, Url};
use serde::Deserialize;
use serde_json::json;

use crate::model::{PurchaseOutcome, Reservation};
use crate::site::{SiteContext, SiteError, TicketSite};

pub struct MockSite;

/// 公演 URL から取り出した送り先
#[derive(Debug, PartialEq, Eq)]
struct Target {
    /// `http://127.0.0.1:8788`
    origin: String,
    /// シナリオ（`ok` / `sold-out` など）
    event_id: String,
}

fn target(event_url: &str) -> Result<Target, SiteError> {
    let url = Url::parse(event_url)
        .map_err(|e| anyhow::anyhow!("公演 URL を読めません: {event_url}: {e}"))?;
    let loopback = match url.host_str() {
        Some("localhost") => true,
        Some(host) => host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<IpAddr>()
            .is_ok_and(|ip| ip.is_loopback()),
        None => false,
    };
    if !loopback {
        return Err(anyhow::anyhow!(
            "モックサイトの予約はローカルのアドレスにしか送りません: {event_url}"
        )
        .into());
    }
    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let ["events", event_id] = segments.as_slice() else {
        return Err(anyhow::anyhow!(
            "公演 URL は /events/{{シナリオ}} の形にしてください: {event_url}"
        )
        .into());
    };
    Ok(Target {
        origin: url.origin().ascii_serialization(),
        event_id: (*event_id).to_string(),
    })
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

    fn clock_probe_url(&self, reservation: &Reservation) -> Option<String> {
        target(&reservation.event_url)
            .ok()
            .map(|t| format!("{}/", t.origin))
    }

    async fn login(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        let t = target(&ctx.reservation.event_url)?;
        let request = ctx
            .http
            .inner()
            .post(format!("{}/api/login", t.origin))
            .json(&json!({}));
        let response = send(ctx, request).await?;
        expect_success(response, "ログイン").await?;
        Ok(())
    }

    async fn prepare(&self, ctx: &mut SiteContext) -> Result<(), SiteError> {
        let t = target(&ctx.reservation.event_url)?;
        let request = ctx
            .http
            .inner()
            .get(format!("{}/api/events/{}", t.origin, t.event_id));
        let response = send(ctx, request).await?;
        expect_success(response, "公演情報の取得").await?;
        Ok(())
    }

    async fn purchase(
        &self,
        ctx: &mut SiteContext,
        _attempt: u32,
    ) -> Result<PurchaseOutcome, SiteError> {
        let t = target(&ctx.reservation.event_url)?;
        let body = json!({
            "ticketType": ctx.reservation.ticket_type,
            "quantity": ctx.reservation.quantity,
            "paymentMethod": ctx.reservation.payment_method,
        });
        let request = ctx
            .http
            .inner()
            .post(format!("{}/api/events/{}/orders", t.origin, t.event_id))
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
    fn reads_origin_and_scenario() {
        assert_eq!(
            target("http://127.0.0.1:8788/events/sold-out").unwrap(),
            Target {
                origin: "http://127.0.0.1:8788".into(),
                event_id: "sold-out".into()
            }
        );
        assert!(target("http://localhost:9000/events/ok/").is_ok());
        assert!(target("http://[::1]:8788/events/ok").is_ok());
    }

    #[test]
    fn refuses_non_loopback_hosts() {
        for url in [
            "https://ticketdive.com/events/ok",
            "http://192.168.0.10:8788/events/ok",
            "http://127.0.0.1.example.com/events/ok",
        ] {
            assert!(target(url).is_err(), "{url}");
        }
    }

    #[test]
    fn requires_event_path() {
        assert!(target("http://127.0.0.1:8788/").is_err());
        assert!(target("http://127.0.0.1:8788/foo/ok").is_err());
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
