//! striker: 自動購入に対応したサイトの予約を、販売開始時刻に購入するワーカー。
//!
//! - config.rs    環境変数からの設定
//! - crypto.rs    サイトのログイン情報の復号
//! - db.rs        予約の取得・結果の保存（SQLite を API と共有）
//! - scheduler.rs 予約のポーリングとタスクの起動
//! - executor.rs  予約 1 件の購入処理
//! - clock.rs     時刻合わせと待機
//! - http.rs      計測つきの HTTP クライアント
//! - retry.rs     上限つきの再試行
//! - site.rs      サイトのアダプタが実装する trait
//! - sites/       登録済みのアダプタ（利用規約で自動化が許されたサイトのみ）

mod clock;
mod config;
mod crypto;
mod db;
mod executor;
mod http;
mod metrics;
mod model;
mod retry;
mod scheduler;
mod site;
mod sites;

use std::sync::Arc;
use std::time::Duration;

use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::db::Db;
use crate::scheduler::Scheduler;
use crate::sites::SiteRegistry;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("striker=info")),
        )
        .init();

    let config = Config::from_env()?;
    let db = wait_for_db(&config).await?;
    let recovered = db.recover_stale()?;
    if recovered > 0 {
        tracing::warn!(recovered, "前回途中で止まった予約を失敗にしました");
    }

    tracing::info!(database = %config.database_path.display(), "striker started");
    let sites = SiteRegistry::from_config(&config.sites)?;
    tracing::info!(sites = ?sites.ids().collect::<Vec<_>>(), "登録済みのサイト");
    Scheduler::new(Arc::new(db), config, sites).run().await
}

/// make dev で API と同時に起動したとき、API がマイグレーションを当て終わるまで待つ
async fn wait_for_db(config: &Config) -> anyhow::Result<Db> {
    const ATTEMPTS: u32 = 30;
    let mut attempt = 1;
    loop {
        let result =
            Db::open(&config.database_path).and_then(|db| db.ensure_migrated().map(|_| db));
        match result {
            Ok(db) => return Ok(db),
            Err(e) if attempt < ATTEMPTS => {
                if attempt == 1 {
                    tracing::info!(error = %format!("{e:#}"), "API がマイグレーションを当てるのを待っています");
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
                attempt += 1;
            }
            Err(e) => return Err(e),
        }
    }
}
