//! 時刻: 現在時刻、サーバー時刻とのずれの推定、目標時刻までの待機。

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::http::TimedClient;
use crate::metrics::Phase;

/// 現在時刻（UNIX ミリ秒）
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

/// 1 回の往復からサーバー時刻とのずれ（サーバー − ローカル、ミリ秒）を推定する。
///
/// サーバー時刻は往復の中間で刻まれたとみなす（NTP と同じ考え方）。
pub fn estimate_offset_ms(local_send_ms: i64, local_recv_ms: i64, server_ms: i64) -> i64 {
    let midpoint = local_send_ms + (local_recv_ms - local_send_ms) / 2;
    server_ms - midpoint
}

/// `url` に HEAD を何回か送り、`Date` ヘッダーからサーバー時刻とのずれを推定する。
/// 往復時間が最も短かった回の値を使う。取れなければ None。
///
/// TODO(#4): `Date` ヘッダーは秒単位なので誤差が最大 ±500ms ある。秒が切り替わる瞬間を
/// 探すように間隔をずらして測り、ミリ秒の精度に近づける
pub async fn measure_offset_ms(http: &mut TimedClient, url: &str, samples: u32) -> Option<i64> {
    let previous = http.phase;
    http.phase = Phase::Clock;
    let mut best: Option<(i64, i64)> = None; // (往復時間, ずれ)
    for _ in 0..samples {
        let Ok(request) = http.inner().head(url).build() else {
            break;
        };
        let send = now_ms();
        let Ok(response) = http.execute(request).await else {
            continue;
        };
        let recv = now_ms();
        let server_ms = response
            .headers()
            .get(reqwest::header::DATE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| httpdate::parse_http_date(v).ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64);
        if let Some(server_ms) = server_ms {
            let rtt = recv - send;
            let offset = estimate_offset_ms(send, recv, server_ms);
            if best.is_none_or(|(best_rtt, _)| rtt < best_rtt) {
                best = Some((rtt, offset));
            }
        }
    }
    http.phase = previous;
    best.map(|(_, offset)| offset)
}

/// 最後にビジーウェイトで合わせる幅
const SPIN_WINDOW: Duration = Duration::from_millis(3);

/// UNIX ミリ秒の `target_ms` になるまで待つ。手前までは眠り、最後の数ミリ秒はビジーウェイトで合わせる
pub async fn wait_until(target_ms: i64) {
    let remaining_ms = target_ms - now_ms();
    if remaining_ms <= 0 {
        return;
    }
    let deadline = Instant::now() + Duration::from_millis(remaining_ms as u64);
    if let Some(sleep_until) = deadline.checked_sub(SPIN_WINDOW) {
        tokio::time::sleep_until(sleep_until.into()).await;
    }
    while Instant::now() < deadline {
        std::hint::spin_loop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_ahead() {
        assert_eq!(estimate_offset_ms(1_000, 1_100, 1_250), 200);
    }

    #[test]
    fn server_behind() {
        assert_eq!(estimate_offset_ms(1_000, 1_100, 1_000), -50);
    }

    #[tokio::test]
    async fn wait_until_does_not_return_early() {
        let target = now_ms() + 30;
        wait_until(target).await;
        assert!(now_ms() >= target);
    }

    #[tokio::test]
    async fn wait_until_past_returns_immediately() {
        let started = Instant::now();
        wait_until(now_ms() - 1_000).await;
        assert!(started.elapsed() < Duration::from_millis(5));
    }
}
