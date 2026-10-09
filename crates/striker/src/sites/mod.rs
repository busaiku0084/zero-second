//! 登録済みのサイトアダプタ（ADR 0014）。
//!
//! ここに登録されていないサイトの予約は処理しない（ADR 0005, 0011）。
//! 利用規約で自動化を禁止しているサイト（TicketDive・LivePocket など）は登録しない。
//! 追加の手順は docs/development/adding-a-site.md。規約の確認（.claude/skills/new-site-adapter）が先。

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::sync::Arc;

use anyhow::bail;
use reqwest::Url;

use crate::config::SitesConfig;
use crate::site::TicketSite;

#[cfg(test)]
pub mod fake;
pub mod mock;
pub mod saucedemo;

/// 検証用のサイトの接続先を、ループバックか Docker のサービス名（ドットを含まないホスト名）に限る。
/// 誤って外部のサイトへ送らないため。返すのは末尾の / なしの origin
pub fn local_origin(base_url: &str, env_name: &str) -> anyhow::Result<String> {
    let url = Url::parse(base_url)
        .map_err(|e| anyhow::anyhow!("{env_name} を読めません: {base_url}: {e}"))?;
    let local = match url.host_str() {
        Some(host) => match host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<IpAddr>()
        {
            Ok(ip) => ip.is_loopback(),
            // localhost や Docker のサービス名（mock-site など）。ドメイン名は外部とみなす
            Err(_) => !host.contains('.'),
        },
        None => false,
    };
    if !local {
        bail!("{env_name} はループバックか Docker のサービス名にしてください: {base_url}");
    }
    Ok(url.origin().ascii_serialization())
}

/// サイト id → アダプタ
#[derive(Default)]
pub struct SiteRegistry {
    sites: BTreeMap<&'static str, Arc<dyn TicketSite>>,
}

impl SiteRegistry {
    /// 設定から、すべてのアダプタを登録する。アダプタを足したらここに 1 行足す
    pub fn from_config(config: &SitesConfig) -> anyhow::Result<Self> {
        let mut registry = Self::default();
        registry.register(Arc::new(mock::MockSite::new(&config.mock_url)?))?;
        registry.register(Arc::new(saucedemo::SauceDemoSite::new(
            &config.sauce_demo_url,
        )?))?;
        Ok(registry)
    }

    pub fn register(&mut self, site: Arc<dyn TicketSite>) -> anyhow::Result<()> {
        let id = site.id();
        if self.sites.insert(id, site).is_some() {
            bail!("サイト {id} のアダプタが二重に登録されています");
        }
        Ok(())
    }

    pub fn find(&self, site_id: &str) -> Option<Arc<dyn TicketSite>> {
        self.sites.get(site_id).cloned()
    }

    pub fn ids(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.sites.keys().copied()
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;
    use crate::config::Config;

    /// packages/shared/src/sites.json（web・api と共通のサイト定義）
    #[derive(Deserialize)]
    struct SiteDefinition {
        id: String,
        automation: String,
    }

    fn definitions() -> Vec<SiteDefinition> {
        serde_json::from_str(include_str!("../../../../packages/shared/src/sites.json")).unwrap()
    }

    fn registry() -> SiteRegistry {
        let config = Config::from_lookup(|_| None).unwrap();
        SiteRegistry::from_config(&config.sites).unwrap()
    }

    #[test]
    fn auto_sites_and_adapters_match() {
        let registry = registry();
        let definitions = definitions();
        for d in &definitions {
            assert_eq!(
                registry.find(&d.id).is_some(),
                d.automation == "auto",
                "{}: sites.json の automation とアダプタの登録が一致しません",
                d.id
            );
        }
        for id in registry.ids() {
            assert!(
                definitions.iter().any(|d| d.id == id),
                "{id}: sites.json に定義のないアダプタです"
            );
        }
    }

    #[test]
    fn sites_banning_automation_are_not_registered() {
        let registry = registry();
        assert!(registry.find("ticketdive").is_none());
        assert!(registry.find("livepocket").is_none());
    }

    #[test]
    fn rejects_duplicate_registration() {
        let mut registry = registry();
        assert!(
            registry
                .register(Arc::new(mock::MockSite::new("http://127.0.0.1:1").unwrap()))
                .is_err()
        );
    }
}
