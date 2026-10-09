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

/// サーバー時刻とのずれ（サーバー − ローカル、ミリ秒）がとりうる範囲 `[lo, hi)`。
///
/// `Date` ヘッダーは秒単位（切り捨て）なので、1 回の往復からは幅 1 秒 + 往復時間の範囲しか分からない。
/// 秒が切り替わる瞬間を狙って何回か送り、範囲を二分探索で狭める（NTP と同じく、サーバーは
/// 送信から受信までのどこかで時刻を刻んだとみなす）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OffsetBounds {
    pub lo: i64,
    pub hi: i64,
}

impl OffsetBounds {
    /// 1 回目の応答から作る
    pub fn new(local_send_ms: i64, local_recv_ms: i64, server_second_ms: i64) -> Self {
        Self {
            lo: server_second_ms - local_recv_ms,
            hi: server_second_ms + 1_000 - local_send_ms,
        }
    }

    /// 応答を 1 回分反映する。矛盾する（サーバー側の揺れなど）ときは反映せず false
    pub fn update(
        &mut self,
        local_send_ms: i64,
        local_recv_ms: i64,
        server_second_ms: i64,
    ) -> bool {
        let other = Self::new(local_send_ms, local_recv_ms, server_second_ms);
        let lo = self.lo.max(other.lo);
        let hi = self.hi.min(other.hi);
        if lo >= hi {
            return false;
        }
        *self = Self { lo, hi };
        true
    }

    pub fn width(self) -> i64 {
        self.hi - self.lo
    }

    /// 推定値（範囲の中央）
    pub fn estimate(self) -> i64 {
        self.lo + self.width() / 2
    }

    /// 次に送る時刻（ローカル、UNIX ミリ秒）。ずれが範囲の中央だとしたとき、サーバーで秒が
    /// 切り替わる瞬間に届くようにする。`now_ms` より後で最も早い時刻を返す
    pub fn next_send_at(self, now_ms: i64, rtt_ms: i64) -> i64 {
        let half_rtt = rtt_ms / 2;
        // サーバーに届く時刻（ローカル）m が m + estimate ≡ 0 (mod 1000) になるようにする
        let earliest_arrival = now_ms + half_rtt + 1;
        let server = earliest_arrival + self.estimate();
        let next_second = server.div_euclid(1_000) * 1_000 + 1_000;
        next_second - self.estimate() - half_rtt
    }
}

/// これ以上は狭めなくてよい幅（往復時間がこれより長ければ往復時間まで）
const ENOUGH_WIDTH_MS: i64 = 10;

/// `url` に HEAD を送り、`Date` ヘッダーからサーバー時刻とのずれを推定する。取れなければ None。
///
/// 1 回の測定に最大 1 秒かかるので、`deadline_ms`（ローカル）を過ぎそうなら途中の範囲で打ち切る。
pub async fn measure_offset_ms(
    http: &mut TimedClient,
    url: &str,
    max_probes: u32,
    deadline_ms: i64,
) -> Option<i64> {
    let previous = http.phase;
    http.phase = Phase::Clock;
    let mut bounds: Option<OffsetBounds> = None;
    let mut rtt = 0;
    for _ in 0..max_probes {
        if let Some(b) = bounds {
            if b.width() <= ENOUGH_WIDTH_MS.max(rtt) {
                break;
            }
            let send_at = b.next_send_at(now_ms(), rtt);
            if send_at + rtt > deadline_ms {
                break;
            }
            wait_until(send_at).await;
        }
        let Some((send, recv, server_second)) = probe(http, url).await else {
            continue;
        };
        rtt = recv - send;
        match bounds.as_mut() {
            None => bounds = Some(OffsetBounds::new(send, recv, server_second)),
            Some(b) => {
                if !b.update(send, recv, server_second) {
                    tracing::debug!(
                        ?b,
                        send,
                        recv,
                        server_second,
                        "時刻合わせの応答が範囲と矛盾しました"
                    );
                }
            }
        }
    }
    http.phase = previous;
    if let Some(b) = bounds {
        tracing::info!(
            offset_ms = b.estimate(),
            width_ms = b.width(),
            "サーバー時刻とのずれを測りました"
        );
    }
    bounds.map(OffsetBounds::estimate)
}

/// HEAD を 1 回送り、(送信時刻, 受信時刻, Date ヘッダーの時刻) を返す
async fn probe(http: &mut TimedClient, url: &str) -> Option<(i64, i64, i64)> {
    let request = http.inner().head(url).build().ok()?;
    let send = now_ms();
    let response = http.execute(request).await.ok()?;
    let recv = now_ms();
    let server = response
        .headers()
        .get(reqwest::header::DATE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| httpdate::parse_http_date(v).ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)?;
    Some((send, recv, server))
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

    /// ずれが `offset` のサーバーに、往復 `rtt`（片道ずつ半分）で問い合わせたときの応答
    fn simulate(send: i64, rtt: i64, offset: i64) -> (i64, i64, i64) {
        let arrival = send + rtt / 2;
        let server_second = (arrival + offset).div_euclid(1_000) * 1_000;
        (send, send + rtt, server_second)
    }

    /// 二分探索で狭めていき、最終的な範囲を返す
    fn converge(offset: i64, rtt: i64, start: i64) -> OffsetBounds {
        let (s, r, d) = simulate(start, rtt, offset);
        let mut b = OffsetBounds::new(s, r, d);
        let mut now = r;
        for _ in 0..10 {
            let send = b.next_send_at(now, rtt);
            assert!(send > now);
            let (s, r, d) = simulate(send, rtt, offset);
            assert!(b.update(s, r, d));
            assert!(
                b.lo <= offset && offset < b.hi,
                "{b:?} が {offset} を含まない"
            );
            now = r;
        }
        b
    }

    #[test]
    fn first_sample_spans_a_second() {
        let b = OffsetBounds::new(10_000, 10_020, 10_000);
        assert_eq!((b.lo, b.hi), (-20, 1_000));
    }

    #[test]
    fn converges_to_true_offset() {
        for offset in [0, 1, -304, 499, -1_250, 123_456] {
            for start in [1_000_000, 1_000_437, 1_000_999] {
                let b = converge(offset, 2, start);
                assert!(b.width() <= 4, "offset {offset}: {b:?}");
                assert!((b.estimate() - offset).abs() <= 2, "offset {offset}: {b:?}");
            }
        }
    }

    #[test]
    fn width_is_limited_by_rtt() {
        // 送信から受信までのどこで刻まれたかは分からないので、往復時間より狭くはならない
        let b = converge(-304, 40, 1_000_000);
        assert!(b.width() <= 42, "{b:?}");
        assert!((b.estimate() + 304).abs() <= 20);
    }

    #[test]
    fn contradicting_sample_is_ignored() {
        let mut b = OffsetBounds { lo: 0, hi: 100 };
        // ずれが 500 以上でないと説明できない応答
        assert!(!b.update(10_000, 10_000, 10_500));
        assert_eq!((b.lo, b.hi), (0, 100));
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
