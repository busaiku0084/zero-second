//! 上限つきの再試行。サイトに過剰なリクエストを送らないため、回数と間隔を必ず制限する。

use std::time::Duration;

use crate::site::SiteError;

#[derive(Debug, Clone)]
pub struct RetryPolicy {
    /// 最初の 1 回を含む試行回数の上限
    pub max_attempts: u32,
    /// 1 回目の再試行までの待ち時間。以降は 2 倍ずつ伸ばす
    pub base_delay: Duration,
    pub max_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_millis(300),
            max_delay: Duration::from_secs(2),
        }
    }
}

impl RetryPolicy {
    /// `attempt` 回目（1 始まり）が `error` で失敗したとき、次の試行までに待つ時間。
    /// 再試行しないなら None。
    ///
    /// 売り切れと、人の対応が必要な状態（CAPTCHA・待機列・購入上限）は再試行しない。
    pub fn next_delay(&self, attempt: u32, error: &SiteError) -> Option<Duration> {
        if attempt >= self.max_attempts || !matches!(error, SiteError::Other(_)) {
            return None;
        }
        let factor = 2u32.saturating_pow(attempt.saturating_sub(1));
        Some(self.base_delay.saturating_mul(factor).min(self.max_delay))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transient() -> SiteError {
        SiteError::Other(anyhow::anyhow!("一時的なエラー"))
    }

    #[test]
    fn delay_doubles_and_caps() {
        let p = RetryPolicy {
            max_attempts: 10,
            ..RetryPolicy::default()
        };
        assert_eq!(
            p.next_delay(1, &transient()),
            Some(Duration::from_millis(300))
        );
        assert_eq!(
            p.next_delay(2, &transient()),
            Some(Duration::from_millis(600))
        );
        assert_eq!(p.next_delay(5, &transient()), Some(Duration::from_secs(2)));
    }

    #[test]
    fn stops_at_max_attempts() {
        let p = RetryPolicy::default();
        assert!(p.next_delay(2, &transient()).is_some());
        assert!(p.next_delay(3, &transient()).is_none());
    }

    #[test]
    fn does_not_retry_sold_out_or_human_action() {
        let p = RetryPolicy::default();
        assert!(p.next_delay(1, &SiteError::SoldOut).is_none());
        assert!(
            p.next_delay(1, &SiteError::HumanActionRequired("CAPTCHA".into()))
                .is_none()
        );
    }
}
