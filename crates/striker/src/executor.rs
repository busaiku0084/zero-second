//! 予約 1 件の購入処理（docs/architecture.md「自動購入の流れ」）。
//!
//! login → prepare → 時刻合わせ → 販売開始まで待機 → purchase（RetryPolicy の範囲で再試行）→ 保存

use anyhow::Context;

use crate::clock::{self, now_ms};
use crate::db::Db;
use crate::http::TimedClient;
use crate::metrics::Phase;
use crate::model::{PurchaseOutcome, Reservation, ReservationStatus, RunFinish, RunResult};
use crate::retry::RetryPolicy;
use crate::site::{SiteContext, SiteError, TicketSite};

/// 時刻合わせで送るリクエストの上限（1 回ごとに範囲がおよそ半分になる。1 秒 → 約 8ms）
const CLOCK_PROBES: u32 = 8;
/// 時刻合わせは販売開始のこれだけ前までに終える
const CLOCK_MARGIN_MS: i64 = 500;

/// 取得済み（preparing）の予約を 1 件実行し、結果を DB に保存する
pub async fn execute(
    db: &Db,
    site: &dyn TicketSite,
    reservation: Reservation,
    policy: &RetryPolicy,
) -> anyhow::Result<RunResult> {
    let run_id = db.create_run(reservation.id, now_ms())?;
    let reservation_id = reservation.id;

    let mut ctx = SiteContext {
        reservation,
        http: TimedClient::new().context("HTTP クライアントを作れません")?,
        // TODO(#4): accounts から読み、CREDENTIALS_ENCRYPTION_KEY で復号する（ADR 0008）
        credentials: None,
    };

    let mut clock_offset_ms = None;
    let result = run_steps(db, site, &mut ctx, policy, &mut clock_offset_ms).await;

    let (run_result, error, outcome) = match result {
        Ok(outcome) => (RunResult::Succeeded, None, Some(outcome)),
        Err(SiteError::SoldOut) => (RunResult::SoldOut, Some("売り切れ".to_string()), None),
        Err(e @ SiteError::HumanActionRequired(_)) => {
            // TODO(#11): 通知を送る
            tracing::warn!(reservation_id, error = %e, "人の対応が必要です");
            (RunResult::NeedsHuman, Some(e.to_string()), None)
        }
        Err(SiteError::Other(e)) => (RunResult::Failed, Some(format!("{e:#}")), None),
    };

    // 計測値は最後にまとめて書く（ADR 0011）
    let timings = ctx.http.take_timings();
    db.finish_run(
        reservation_id,
        run_id,
        &RunFinish {
            result: run_result,
            finished_at_ms: now_ms(),
            clock_offset_ms,
            error,
            outcome,
        },
        &timings,
    )?;
    tracing::info!(
        reservation_id,
        run_id,
        result = run_result.as_str(),
        "実行が終わりました"
    );
    Ok(run_result)
}

async fn run_steps(
    db: &Db,
    site: &dyn TicketSite,
    ctx: &mut SiteContext,
    policy: &RetryPolicy,
    clock_offset_ms: &mut Option<i64>,
) -> Result<PurchaseOutcome, SiteError> {
    ctx.http.phase = Phase::Login;
    site.login(ctx).await?;

    ctx.http.phase = Phase::Prepare;
    site.prepare(ctx).await?;

    if let Some(url) = site.clock_probe_url(&ctx.reservation) {
        let deadline_ms = ctx.reservation.sale_starts_at_ms - CLOCK_MARGIN_MS;
        *clock_offset_ms =
            clock::measure_offset_ms(&mut ctx.http, &url, CLOCK_PROBES, deadline_ms).await;
    }

    // サーバーの時計で販売開始になる瞬間 = 端末の時計で (販売開始 − ずれ)
    let target_ms = ctx.reservation.sale_starts_at_ms - clock_offset_ms.unwrap_or(0);
    db.set_status(ctx.reservation.id, ReservationStatus::Running)
        .map_err(SiteError::Other)?;
    clock::wait_until(target_ms).await;

    ctx.http.phase = Phase::Purchase;
    let mut attempt = 1;
    loop {
        match site.purchase(ctx, attempt).await {
            Ok(outcome) => return Ok(outcome),
            Err(e) => match policy.next_delay(attempt, &e) {
                Some(delay) => {
                    tracing::warn!(attempt, error = %e, "購入を再試行します");
                    tokio::time::sleep(delay).await;
                    attempt += 1;
                }
                None => return Err(e),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::db::testing::*;
    use crate::sites::fake::{FakeBehavior, FakeSite};

    fn fast_policy() -> RetryPolicy {
        RetryPolicy {
            max_attempts: 3,
            base_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(2),
        }
    }

    async fn run_with(behavior: FakeBehavior) -> (Db, i64, RunResult) {
        let db = migrated_db();
        let id = insert_reservation(&db, "mock", "auto", now_ms() + 20);
        let reservation = db.due_reservations(now_ms(), 60_000).unwrap().remove(0);
        assert!(db.claim(id).unwrap());
        let site = FakeSite {
            behavior,
            ..FakeSite::default()
        };
        let result = execute(&db, &site, reservation, &fast_policy())
            .await
            .unwrap();
        (db, id, result)
    }

    #[tokio::test]
    async fn success_marks_reservation_succeeded() {
        let (db, id, result) = run_with(FakeBehavior::Succeed).await;
        assert_eq!(result, RunResult::Succeeded);
        assert_eq!(status_of(&db, id), "succeeded");
        assert_eq!(last_run(&db, id).0, "succeeded");
    }

    #[tokio::test]
    async fn transient_errors_are_retried() {
        let (_, _, result) = run_with(FakeBehavior::FailTimes(2)).await;
        assert_eq!(result, RunResult::Succeeded);
    }

    #[tokio::test]
    async fn too_many_errors_fail() {
        let (db, id, result) = run_with(FakeBehavior::FailTimes(5)).await;
        assert_eq!(result, RunResult::Failed);
        assert_eq!(status_of(&db, id), "failed");
        assert!(last_run(&db, id).1.unwrap().contains("一時的なエラー"));
    }

    #[tokio::test]
    async fn human_action_stops_without_retry() {
        let (db, id, result) = run_with(FakeBehavior::NeedsHuman).await;
        assert_eq!(result, RunResult::NeedsHuman);
        assert_eq!(status_of(&db, id), "needs_human");
    }

    #[tokio::test]
    async fn sold_out_is_recorded() {
        let (db, id, result) = run_with(FakeBehavior::SoldOut).await;
        assert_eq!(result, RunResult::SoldOut);
        assert_eq!(status_of(&db, id), "failed");
    }
}
