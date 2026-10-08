//! 計測つきの HTTP クライアント。サイトのアダプタは必ずこれを通してリクエストを送る。
//!
//! 計測値はメモリに溜め、実行の最後にまとめて DB へ書く（ADR 0011）。

use std::time::{Duration, Instant};

use reqwest::{Client, Request, Response};

use crate::clock::now_ms;
use crate::metrics::{Phase, RequestTiming};

pub struct TimedClient {
    client: Client,
    /// 今の段階。executor が login / prepare / clock / purchase の前に切り替える
    pub phase: Phase,
    timings: Vec<RequestTiming>,
}

impl TimedClient {
    pub fn new() -> anyhow::Result<Self> {
        let client = Client::builder()
            // 販売開始まで接続を張ったまま待てるようにする
            .pool_idle_timeout(Duration::from_secs(300))
            .tcp_keepalive(Duration::from_secs(30))
            .tcp_nodelay(true)
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("zero-second-striker/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            client,
            phase: Phase::Login,
            timings: Vec::new(),
        })
    }

    /// リクエストを組み立てる（`execute` に渡す）
    pub fn inner(&self) -> &Client {
        &self.client
    }

    /// リクエストを送り、所要時間を記録する。失敗したリクエストも記録する
    pub async fn execute(&mut self, request: Request) -> reqwest::Result<Response> {
        let method = request.method().to_string();
        let url = request.url().to_string();
        let started_at_ms = now_ms();
        let started = Instant::now();
        let result = self.client.execute(request).await;
        self.timings.push(RequestTiming {
            phase: self.phase,
            method,
            url,
            status: result.as_ref().ok().map(|r| r.status().as_u16()),
            started_at_ms,
            duration_ms: started.elapsed().as_secs_f64() * 1000.0,
        });
        result
    }

    /// 溜まった計測値を取り出す
    pub fn take_timings(&mut self) -> Vec<RequestTiming> {
        std::mem::take(&mut self.timings)
    }
}
