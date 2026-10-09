import {
  type EventInfo,
  eventTitleForSauceDemo,
  eventUrlMatchesSite,
  findSite,
  SAUCE_DEMO_PRODUCTS,
  supportsEventInfo,
} from "@zero-second/shared";
import { z } from "zod";

/**
 * 公演 URL から公演情報（公演名・席種・枚数の上限）を読む（#43）。
 *
 * - 自動化を許可しているサイト（`supportsEventInfo`）だけに対応する。それ以外のサイトのページは取りに行かない
 * - 送り先は設定の接続先（`MOCK_SITE_URL`）だけ。予約の URL からは公演の id だけを読み、そのホストへは送らない
 */
export type EventInfoOptions = {
  /** モックサイトの接続先。ループバックか Docker のサービス名に限る */
  mockSiteUrl: string;
  fetch?: typeof fetch;
};

export class EventInfoError extends Error {
  constructor(
    readonly status: 404 | 422 | 502,
    message: string,
  ) {
    super(message);
  }
}

/** 応答を待つ上限。予約の登録画面で待たせすぎない */
const TIMEOUT_MS = 3000;

const mockEventSchema = z.object({
  title: z.string().min(1).max(200),
  tickets: z.array(z.object({ name: z.string().min(1).max(200) })).min(1),
  maxPerOrder: z.number().int().min(1).max(10),
});

export async function resolveEventInfo(
  siteId: string,
  eventUrl: string,
  options: EventInfoOptions,
): Promise<EventInfo> {
  const site = findSite(siteId);
  if (!site) throw new EventInfoError(422, "サイトが正しくありません");
  if (!supportsEventInfo(site)) {
    throw new EventInfoError(422, "このサイトは公演情報の自動入力に対応していません");
  }
  if (!eventUrlMatchesSite(site, eventUrl)) {
    throw new EventInfoError(422, "選んだサイトの公演ページの URL を入力してください");
  }
  const url = new URL(eventUrl);
  switch (site.id) {
    case "mock":
      return mockEventInfo(url, options);
    case "saucedemo":
      return sauceDemoEventInfo(url);
    default:
      throw new EventInfoError(422, "このサイトは公演情報の自動入力に対応していません");
  }
}

/** モックサイト: `/events/{シナリオ}` のシナリオで、公演情報の API を読む */
async function mockEventInfo(url: URL, options: EventInfoOptions): Promise<EventInfo> {
  const match = /^\/events\/([\w-]+)\/?$/.exec(url.pathname);
  if (!match?.[1]) {
    throw new EventInfoError(422, "公演 URL は /events/{シナリオ} の形にしてください");
  }
  const origin = localOrigin(options.mockSiteUrl);
  let res: Response;
  try {
    res = await (options.fetch ?? fetch)(`${origin}/api/events/${match[1]}`, {
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new EventInfoError(502, "モックサイトにつながりません");
  }
  if (res.status === 404) throw new EventInfoError(404, "公演が見つかりません");
  if (!res.ok)
    throw new EventInfoError(502, `モックサイトがエラーを返しました（HTTP ${res.status}）`);
  const parsed = mockEventSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new EventInfoError(502, "公演情報を読めません");
  return {
    title: parsed.data.title,
    ticketTypes: parsed.data.tickets.map((t) => t.name),
    maxQuantity: parsed.data.maxPerOrder,
  };
}

/** Sauce Demo: 商品ページの `id` から、共通の商品一覧で作る（通信しない）。1 点ずつしか買えない */
function sauceDemoEventInfo(url: URL): EventInfo {
  const id = Number(url.searchParams.get("id"));
  const product = SAUCE_DEMO_PRODUCTS.find((p) => p.id === id);
  if (!url.pathname.endsWith("/inventory-item.html") || !product) {
    throw new EventInfoError(404, "商品が見つかりません");
  }
  return {
    title: eventTitleForSauceDemo(product.name),
    ticketTypes: [product.name],
    maxQuantity: 1,
  };
}

/**
 * 接続先をループバックか Docker のサービス名（ドットを含まないホスト名）に限り、origin を返す。
 * 誤って外部のサイトへ送らないため（striker の `local_origin` と同じ考え方）
 */
export function localOrigin(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new EventInfoError(502, "MOCK_SITE_URL を読めません");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local =
    host === "::1" ||
    /^127\.\d+\.\d+\.\d+$/.test(host) ||
    (!host.includes(".") && !host.includes(":"));
  if (!local)
    throw new EventInfoError(
      502,
      "MOCK_SITE_URL はループバックか Docker のサービス名にしてください",
    );
  return url.origin;
}
