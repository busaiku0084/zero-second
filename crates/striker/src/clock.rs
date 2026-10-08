//! サーバー時刻とのずれの推定。

/// 1 回の往復からサーバー時刻とのずれ（サーバー − ローカル、ミリ秒）を推定する。
///
/// サーバー時刻は往復の中間で刻まれたとみなす（NTP と同じ考え方）。
pub fn estimate_offset_ms(local_send_ms: i64, local_recv_ms: i64, server_ms: i64) -> i64 {
    let midpoint = local_send_ms + (local_recv_ms - local_send_ms) / 2;
    server_ms - midpoint
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
}
