/**
 * 対応サイトの一覧。
 *
 * automation は利用規約の確認結果（docs/sites/README.md）と必ず一致させる。
 * 自動購入を規約で禁止しているサイトは "manual"（購入補助のみ）にする。
 */
export const SITES = [
  {
    id: "ticketdive",
    name: "TicketDive",
    url: "https://ticketdive.com/",
    automation: "manual",
  },
  {
    id: "livepocket",
    name: "LivePocket",
    url: "https://livepocket.jp/",
    automation: "manual",
  },
  {
    id: "mock",
    name: "モックサイト（検証用）",
    url: "http://localhost/",
    automation: "auto",
  },
] as const satisfies readonly Site[];

export type Site = {
  id: string;
  name: string;
  url: string;
  /** manual: 購入補助のみ / auto: striker による自動購入に対応 */
  automation: "manual" | "auto";
};

export type SiteId = (typeof SITES)[number]["id"];

export const SITE_IDS = SITES.map((s) => s.id) as [SiteId, ...SiteId[]];

export function findSite(id: string): Site | undefined {
  return SITES.find((s) => s.id === id);
}
