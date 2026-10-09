//! 環境変数からの設定。値の意味は docs/operations.md を参照。

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, bail};

use crate::crypto::CredentialKey;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_path: PathBuf,
    /// 予約を確認する間隔
    pub poll_interval: Duration,
    /// 販売開始のどれだけ前に準備を始めるか
    pub lead: Duration,
    pub sites: SitesConfig,
    /// サイトのログイン情報を復号する鍵（`CREDENTIALS_ENCRYPTION_KEY`、API と同じ値）。
    /// 未設定なら、アカウントを指定した予約は失敗にする
    pub credential_key: Option<CredentialKey>,
}

/// アダプタごとの設定。アダプタを足したら、必要な項目をここに足す
#[derive(Debug, Clone)]
pub struct SitesConfig {
    /// モックサイトの接続先（`MOCK_SITE_URL`）。Docker ではサービス名（`http://mock-site:...`）になる
    pub mock_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    pub(crate) fn from_lookup(get: impl Fn(&str) -> Option<String>) -> anyhow::Result<Self> {
        let url = get("DATABASE_URL").unwrap_or_else(|| "file:./data/zero-second.sqlite".into());
        Ok(Self {
            database_path: database_path(&url)?,
            poll_interval: Duration::from_millis(ms(&get, "STRIKER_POLL_INTERVAL_MS", 1_000)?),
            lead: Duration::from_millis(ms(&get, "STRIKER_LEAD_MS", 120_000)?),
            sites: SitesConfig {
                mock_url: get("MOCK_SITE_URL")
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or_else(|| "http://127.0.0.1:47302".into()),
            },
            credential_key: match get("CREDENTIALS_ENCRYPTION_KEY") {
                Some(v) if !v.trim().is_empty() => Some(CredentialKey::parse(&v)?),
                _ => None,
            },
        })
    }
}

/// `file:./data/xxx.sqlite` → パス。相対パスは作業ディレクトリ（リポジトリ直下）から解決する
fn database_path(url: &str) -> anyhow::Result<PathBuf> {
    let path = url.strip_prefix("file:").unwrap_or(url);
    if path.is_empty() {
        bail!("DATABASE_URL が空です");
    }
    Ok(PathBuf::from(path))
}

fn ms(get: &impl Fn(&str) -> Option<String>, key: &str, default: u64) -> anyhow::Result<u64> {
    match get(key) {
        None => Ok(default),
        Some(v) if v.trim().is_empty() => Ok(default),
        Some(v) => v
            .trim()
            .parse()
            .with_context(|| format!("{key} はミリ秒の整数で指定してください: {v}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config(pairs: &[(&str, &str)]) -> anyhow::Result<Config> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        Config::from_lookup(|k| map.get(k).cloned())
    }

    #[test]
    fn defaults() {
        let c = config(&[]).unwrap();
        assert_eq!(c.database_path, PathBuf::from("./data/zero-second.sqlite"));
        assert_eq!(c.poll_interval, Duration::from_secs(1));
        assert_eq!(c.lead, Duration::from_secs(120));
    }

    #[test]
    fn env_overrides() {
        let c = config(&[
            ("DATABASE_URL", "file:/tmp/x.sqlite"),
            ("STRIKER_LEAD_MS", "5000"),
        ])
        .unwrap();
        assert_eq!(c.database_path, PathBuf::from("/tmp/x.sqlite"));
        assert_eq!(c.lead, Duration::from_secs(5));
    }

    #[test]
    fn credential_key_is_optional_but_validated() {
        assert!(config(&[]).unwrap().credential_key.is_none());
        let key = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
        assert!(
            config(&[("CREDENTIALS_ENCRYPTION_KEY", key)])
                .unwrap()
                .credential_key
                .is_some()
        );
        assert!(config(&[("CREDENTIALS_ENCRYPTION_KEY", "short")]).is_err());
    }

    #[test]
    fn rejects_non_numeric() {
        assert!(config(&[("STRIKER_POLL_INTERVAL_MS", "1s")]).is_err());
    }
}
