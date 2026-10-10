import { z } from "zod";
import siteData from "./sites.json" with { type: "json" };

/**
 * 対応サイトの一覧。定義は sites.json にあり、striker（Rust）のテストも同じファイルを読む。
 *
 * - automation は利用規約の確認結果（docs/sites/README.md）と必ず一致させる。
 *   自動購入を規約で禁止しているサイトは "manual"（購入補助のみ）にする
 * - "auto" のサイトには striker のアダプタが必要（無いと Rust のテストが落ちる）
 * - 追加の手順は docs/development/adding-a-site.md
 */
const siteSchema = z.object({
  /** 識別子。DB の site 列・striker のアダプタの id と一致させる */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** トップページ。フォームの例示に使う */
  url: z.url(),
  /** 公演 URL として受け付けるホスト。サブドメインも含む */
  hosts: z.array(z.string().min(1)).min(1),
  /** manual: 購入補助のみ / auto: striker による自動購入に対応 */
  automation: z.enum(["manual", "auto"]),
  /**
   * 公演ページを予約の登録画面に埋め込めるか（ADR 0024）。サイトが X-Frame-Options などで
   * 拒否していると分かったら false にする。拒否は回避せず、別ウィンドウで開いてもらう
   */
  embeddable: z.boolean().default(true),
});

export type Site = z.infer<typeof siteSchema>;
export type SiteId = Site["id"];

export const SITES: readonly Site[] = z.array(siteSchema).parse(siteData);

export const SITE_IDS = SITES.map((s) => s.id) as [SiteId, ...SiteId[]];

export function findSite(id: string): Site | undefined {
  return SITES.find((s) => s.id === id);
}

/**
 * 公演 URL から公演情報を自動で入れられるか（#43）。
 *
 * 自動化を許可しているサイト（automation: "auto"）だけ。"manual" のサイト（TicketDive・LivePocket）は
 * 利用規約で BOT などの自動化手段や構造の解析を禁止しているので、プログラムでページを取りに行かない
 */
export function supportsEventInfo(site: Site): boolean {
  return site.automation === "auto";
}

/** 公演 URL のホストが、サイトのホスト（またはそのサブドメイン）か */
export function eventUrlMatchesSite(site: Site, eventUrl: string): boolean {
  let host: string;
  try {
    host = new URL(eventUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return site.hosts.some((h) => host === h || host.endsWith(`.${h}`));
}
