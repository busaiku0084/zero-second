//! リクエスト単位の計測値。DB の timings テーブルに記録し、ダッシュボードで表示する。

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct RequestTiming {
    pub run_id: i64,
    /// 何の処理か（login / prepare / purchase など）
    pub phase: String,
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub started_at_ms: i64,
    pub duration_ms: f64,
}
