//! 登録済みのサイトアダプタ。
//!
//! ここに載っていないサイトの予約は処理しない（ADR 0005, 0011）。
//! 利用規約で自動化を禁止しているサイト（TicketDive・LivePocket など）は載せない。
//! 追加する前に .claude/skills/new-site-adapter の手順で規約を確認し、docs/sites/README.md に記録する。

use std::sync::Arc;

use crate::site::TicketSite;

#[cfg(test)]
pub mod fake;
pub mod mock;

pub fn find(site_id: &str) -> Option<Arc<dyn TicketSite>> {
    match site_id {
        "mock" => Some(Arc::new(mock::MockSite)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sites_banning_automation_are_not_registered() {
        assert!(find("ticketdive").is_none());
        assert!(find("livepocket").is_none());
        assert!(find("mock").is_some());
    }
}
