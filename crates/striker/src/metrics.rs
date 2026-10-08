//! リクエスト単位の計測値。DB の timings テーブルに記録し、ダッシュボードで表示する。

use serde::Serialize;

/// どの段階のリクエストか（timings.phase）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Login,
    Prepare,
    Clock,
    Purchase,
}

impl Phase {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Login => "login",
            Self::Prepare => "prepare",
            Self::Clock => "clock",
            Self::Purchase => "purchase",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RequestTiming {
    pub phase: Phase,
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub started_at_ms: i64,
    pub duration_ms: f64,
}
