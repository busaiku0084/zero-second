// 骨格段階のため未使用の型がある。#4 でワーカーの処理が入ったら外す。
#![allow(dead_code)]

mod clock;
mod metrics;
mod model;
mod site;
mod sites;

use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    tracing::info!("striker started");

    // TODO(#4): DB から実行待ちの予約を取り出し、時刻同期 → prepare → purchase を実行する
    Ok(())
}
