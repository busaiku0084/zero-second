//! モックサイトを API（HTTP）で買う。API を叩くアダプタの骨格の見本（ADR 0022）。
//!
//! - リクエストは必ず `ctx.http`（`TimedClient`）で送る。送ったものはすべて timings に残る
//! - login / prepare は販売開始前。ここで分かる間違い（席種・枚数）は、ここで止める
//! - purchase は販売開始の瞬間。リクエストは 1 本だけにし、応答をエラーの種類に振り分ける
//!   （売り切れ → `SoldOut`、CAPTCHA・購入上限 → `HumanActionRequired`、それ以外 → 再試行の対象）

use reqwest::{Response, StatusCode};
use serde::Deserialize;
use serde_json::json;

use super::{MockSite, event_id, over_limit, unknown_ticket_type};
use crate::model::PurchaseOutcome;
use crate::site::{SiteContext, SiteError};

/// `GET /api/events/{id}`
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventResponse {
    tickets: Vec<TicketResponse>,
    max_per_order: u32,
}

#[derive(Debug, Deserialize)]
struct TicketResponse {
    name: String,
}

/// `POST /api/events/{id}/orders` の成功
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderResponse {
    order_id: String,
    payment_reference: Option<String>,
    payment_due_at_ms: Option<i64>,
}

/// 失敗の応答（`{ "error": "sold_out" }` など）
#[derive(Debug, Default, Deserialize)]
struct ErrorResponse {
    error: Option<String>,
}

/// 1. ログイン。セッションの Cookie は `ctx.http` が持ち続ける
pub(super) async fn login(site: &MockSite, ctx: &mut SiteContext) -> Result<(), SiteError> {
    // アカウントを指定していればログイン情報を送る（モックはどの値でも受け付ける。アカウントは任意）
    let body = match &ctx.credentials {
        Some(c) => json!({ "loginId": c.login_id, "password": c.password }),
        None => json!({}),
    };
    let request = ctx.http.inner().post(site.url("/api/login")).json(&body);
    let response = send(ctx, request).await?;
    expect_success(response, "ログイン").await?;
    Ok(())
}

/// 2. 準備。公演情報を読み、予約の席種と枚数で買えるかを販売開始前に確かめる。
///
/// 同じホストへの接続もここで張っておく（販売開始の瞬間に TLS などを待たない）
pub(super) async fn prepare(site: &MockSite, ctx: &mut SiteContext) -> Result<(), SiteError> {
    let id = event_id(&ctx.reservation.event_url)?;
    let request = ctx.http.inner().get(site.url(&format!("/api/events/{id}")));
    let response = send(ctx, request).await?;
    let event: EventResponse = expect_success(response, "公演情報の取得")
        .await?
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("公演情報を読めません: {e}"))?;
    check_order(
        &event,
        &ctx.reservation.ticket_type,
        ctx.reservation.quantity,
    )
}

/// 3. 購入。販売開始の瞬間に注文を 1 本送る
pub(super) async fn purchase(
    site: &MockSite,
    ctx: &mut SiteContext,
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
        .post(site.url(&format!("/api/events/{id}/orders")))
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

/// 予約の席種と枚数で買えるか
fn check_order(event: &EventResponse, ticket_type: &str, quantity: u32) -> Result<(), SiteError> {
    if !event.tickets.iter().any(|t| t.name == ticket_type) {
        let names: Vec<String> = event.tickets.iter().map(|t| t.name.clone()).collect();
        return Err(unknown_ticket_type(ticket_type, &names));
    }
    if quantity > event.max_per_order {
        return Err(over_limit(quantity, event.max_per_order));
    }
    Ok(())
}

/// 購入の失敗を SiteError にする。売り切れ・CAPTCHA・購入上限以外は再試行の対象
fn order_error(status: StatusCode, code: Option<&str>) -> SiteError {
    match (status, code) {
        (StatusCode::CONFLICT, Some("sold_out")) => SiteError::SoldOut,
        (StatusCode::FORBIDDEN, Some("captcha_required")) => {
            SiteError::HumanActionRequired("CAPTCHA が表示されました".into())
        }
        (StatusCode::BAD_REQUEST, Some("over_limit")) => {
            SiteError::HumanActionRequired("1 回の注文の枚数の上限を超えています".into())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn event() -> EventResponse {
        serde_json::from_value(json!({
            "id": "ok",
            "title": "モック公演「成功」",
            "tickets": [{ "name": "一般", "price": 5500, "remaining": 100 }, { "name": "前方エリア" }],
            "maxPerOrder": 4
        }))
        .unwrap()
    }

    #[test]
    fn checks_ticket_type_and_quantity_before_the_sale() {
        assert!(check_order(&event(), "前方エリア", 4).is_ok());
        assert!(matches!(
            check_order(&event(), "S席", 1),
            Err(SiteError::Other(_))
        ));
        assert!(matches!(
            check_order(&event(), "一般", 5),
            Err(SiteError::HumanActionRequired(_))
        ));
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
            order_error(StatusCode::BAD_REQUEST, Some("over_limit")),
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
