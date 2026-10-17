//! モックサイトを API（HTTP）で買う。API を叩くアダプタの骨格の見本（ADR 0022）。
//!
//! - リクエストは必ず `ctx.http`（`TimedClient`）で送る。送ったものはすべて timings に残る
//! - login / prepare は販売開始前。ここで分かる間違い（ログイン情報・席種・枚数）は、ここで止める
//! - 購入に要る値（CSRF トークン・席種の id）は login / prepare で `ctx.prepared` に控え、
//!   purchase では読むだけにする（販売開始の瞬間に余計なリクエストを送らない）
//! - purchase は販売開始の瞬間。リクエストは 1 本だけにし、応答をエラーの種類に振り分ける
//!   （売り切れ → `SoldOut`、CAPTCHA・待機列・購入上限 → `HumanActionRequired`、それ以外 → 再試行の対象）

use reqwest::{Response, StatusCode};
use serde::Deserialize;
use serde_json::json;

use super::{MockSite, event_id, over_limit, unknown_ticket_type};
use crate::model::PurchaseOutcome;
use crate::site::{SiteContext, SiteError};

/// `ctx.prepared` のキー: ログインの応答で受け取る CSRF トークン（注文の `X-CSRF-Token` ヘッダーに入れる）
const CSRF_TOKEN: &str = "csrf_token";
/// `ctx.prepared` のキー: 予約の席種（名前）に対応する、サイトの席種の id
const TICKET_ID: &str = "ticket_id";

/// `POST /api/login` の成功
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    csrf_token: String,
}

/// `GET /api/events/{id}`
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventResponse {
    tickets: Vec<TicketResponse>,
    max_per_order: u32,
}

#[derive(Debug, Deserialize)]
struct TicketResponse {
    id: String,
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

/// 1. ログイン。セッションの Cookie は `ctx.http` が持ち続け、CSRF トークンは `ctx.prepared` に控える
pub(super) async fn login(site: &MockSite, ctx: &mut SiteContext) -> Result<(), SiteError> {
    // アカウントを指定していればログイン情報を送る（モックは locked 以外のどの値でも受け付ける。アカウントは任意）
    let body = match &ctx.credentials {
        Some(c) => json!({ "loginId": c.login_id, "password": c.password }),
        None => json!({}),
    };
    let request = ctx.http.inner().post(site.url("/api/login")).json(&body);
    let response = send(ctx, request).await?;
    let status = response.status();
    if !status.is_success() {
        let error: ErrorResponse = response.json().await.unwrap_or_default();
        return Err(login_error(status, error.error.as_deref()));
    }
    let login: LoginResponse = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("ログインの応答を読めません: {e}"))?;
    ctx.prepared.insert(CSRF_TOKEN, login.csrf_token);
    Ok(())
}

/// 2. 準備。公演情報を読み、予約の席種と枚数で買えるかを販売開始前に確かめ、席種の id を控える。
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
    let ticket_id = check_order(
        &event,
        &ctx.reservation.ticket_type,
        ctx.reservation.quantity,
    )?;
    ctx.prepared.insert(TICKET_ID, ticket_id);
    Ok(())
}

/// 3. 購入。販売開始の瞬間に注文を 1 本送る。login / prepare で控えた値を使う
pub(super) async fn purchase(
    site: &MockSite,
    ctx: &mut SiteContext,
) -> Result<PurchaseOutcome, SiteError> {
    let id = event_id(&ctx.reservation.event_url)?;
    let csrf_token = prepared(ctx, CSRF_TOKEN)?;
    let body = json!({
        "ticketId": prepared(ctx, TICKET_ID)?,
        "quantity": ctx.reservation.quantity,
        "paymentMethod": ctx.reservation.payment_method,
    });
    let request = ctx
        .http
        .inner()
        .post(site.url(&format!("/api/events/{id}/orders")))
        .header("X-CSRF-Token", csrf_token)
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

/// login / prepare で控えた値。なければ段階の順番の誤りなので、再試行しても直らない
fn prepared(ctx: &SiteContext, key: &str) -> Result<String, SiteError> {
    ctx.prepared.get(key).cloned().ok_or_else(|| {
        SiteError::Other(anyhow::anyhow!(
            "{key} が準備されていません（login・prepare の後に呼んでください）"
        ))
    })
}

/// 予約の席種と枚数で買えるか。買えるなら、注文に使う席種の id を返す
fn check_order(
    event: &EventResponse,
    ticket_type: &str,
    quantity: u32,
) -> Result<String, SiteError> {
    let Some(ticket) = event.tickets.iter().find(|t| t.name == ticket_type) else {
        let names: Vec<String> = event.tickets.iter().map(|t| t.name.clone()).collect();
        return Err(unknown_ticket_type(ticket_type, &names));
    };
    if quantity > event.max_per_order {
        return Err(over_limit(quantity, event.max_per_order));
    }
    Ok(ticket.id.clone())
}

/// ログインの失敗を SiteError にする。ID・パスワードの誤りは、何度送っても通らないので文言で分かるようにする
fn login_error(status: StatusCode, code: Option<&str>) -> SiteError {
    match (status, code) {
        (StatusCode::UNAUTHORIZED, Some("invalid_credentials")) => SiteError::Other(
            anyhow::anyhow!("ログインできません（ID かパスワードが違います）"),
        ),
        _ => SiteError::Other(anyhow::anyhow!(
            "ログインに失敗しました: HTTP {}",
            status.as_u16()
        )),
    }
}

/// 購入の失敗を SiteError にする。売り切れ・CAPTCHA・待機列・購入上限以外は再試行の対象
fn order_error(status: StatusCode, code: Option<&str>) -> SiteError {
    match (status, code) {
        (StatusCode::CONFLICT, Some("sold_out")) => SiteError::SoldOut,
        (StatusCode::FORBIDDEN, Some("captcha_required")) => {
            SiteError::HumanActionRequired("CAPTCHA が表示されました".into())
        }
        (StatusCode::SERVICE_UNAVAILABLE, Some("queue_required")) => {
            SiteError::HumanActionRequired("待機列に入りました".into())
        }
        (StatusCode::UNAUTHORIZED, _) | (StatusCode::FORBIDDEN, Some("invalid_csrf")) => {
            SiteError::Other(anyhow::anyhow!(
                "ログインが切れています（HTTP {}）",
                status.as_u16()
            ))
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
            "tickets": [
                { "id": "general", "name": "一般", "price": 5500, "remaining": 100 },
                { "id": "front", "name": "前方エリア" }
            ],
            "maxPerOrder": 4
        }))
        .unwrap()
    }

    #[test]
    fn checks_ticket_type_and_quantity_before_the_sale() {
        assert_eq!(check_order(&event(), "前方エリア", 4).unwrap(), "front");
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
            order_error(StatusCode::SERVICE_UNAVAILABLE, Some("queue_required")),
            SiteError::HumanActionRequired(_)
        ));
        assert!(matches!(
            order_error(StatusCode::FORBIDDEN, Some("invalid_csrf")),
            SiteError::Other(_)
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

    #[test]
    fn maps_login_errors() {
        assert!(
            login_error(StatusCode::UNAUTHORIZED, Some("invalid_credentials"))
                .to_string()
                .contains("ID かパスワードが違います")
        );
        assert!(
            login_error(StatusCode::INTERNAL_SERVER_ERROR, None)
                .to_string()
                .contains("HTTP 500")
        );
    }
}
