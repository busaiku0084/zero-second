import { z } from "zod";
import { eventUrlMatchesSite, findSite, SITE_IDS } from "./sites";

// バリデーションのメッセージを日本語にする（web・api 共通）
z.config(z.locales.ja());

export const PAYMENT_METHODS = ["convenience_store"] as const;
export const RESERVATION_MODES = ["manual", "auto"] as const;
export const RESERVATION_STATUSES = [
  "pending",
  "preparing",
  "running",
  "succeeded",
  "failed",
  "needs_human",
  "cancelled",
] as const;
export const RUN_RESULTS = ["succeeded", "sold_out", "failed", "needs_human"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ReservationMode = (typeof RESERVATION_MODES)[number];
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export type RunResult = (typeof RUN_RESULTS)[number];

// ---- accounts ----

export const accountCreateSchema = z.object({
  site: z.enum(SITE_IDS),
  loginId: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
});

export const accountUpdateSchema = z
  .object({
    loginId: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(256),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "更新する項目がありません");

export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;

// ---- reservations ----

const reservationFields = z.object({
  site: z.enum(SITE_IDS),
  accountId: z.number().int().positive().nullable().default(null),
  title: z.string().trim().min(1).max(200),
  eventUrl: z.url().max(2048),
  ticketType: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(10),
  paymentMethod: z.enum(PAYMENT_METHODS).default("convenience_store"),
  saleStartsAtMs: z.number().int().positive(),
  mode: z.enum(RESERVATION_MODES).default("manual"),
  notes: z.string().max(2000).default(""),
});

/** 自動購入は、規約上自動化が許されているサイトでのみ選べる */
function autoModeAllowed(v: { site?: string; mode?: ReservationMode }): boolean {
  if (v.mode !== "auto" || v.site === undefined) return true;
  return findSite(v.site)?.automation === "auto";
}

const AUTO_MODE_MESSAGE = "このサイトは利用規約により自動購入に対応していません";

/** 公演 URL がサイトのものか（別サイトの URL を登録しないように） */
function eventUrlAllowed(v: { site?: string; eventUrl?: string }): boolean {
  if (v.site === undefined || v.eventUrl === undefined) return true;
  const site = findSite(v.site);
  return site === undefined || eventUrlMatchesSite(site, v.eventUrl);
}

export const EVENT_URL_MESSAGE = "選んだサイトの公演ページの URL を入力してください";

export const reservationCreateSchema = reservationFields
  .refine(autoModeAllowed, { message: AUTO_MODE_MESSAGE, path: ["mode"] })
  .refine(eventUrlAllowed, { message: EVENT_URL_MESSAGE, path: ["eventUrl"] });

export const reservationUpdateSchema = reservationFields
  .omit({ site: true })
  .partial()
  .extend({ status: z.enum(["pending", "cancelled"]).optional() })
  .refine((v) => Object.keys(v).length > 0, "更新する項目がありません");

export type ReservationCreate = z.input<typeof reservationCreateSchema>;
export type ReservationUpdate = z.input<typeof reservationUpdateSchema>;

// ---- manual runs (#14) ----

export const manualRunCreateSchema = z.object({
  result: z.enum(RUN_RESULTS),
  /** 購入を始めた時刻。省略時は販売開始時刻 */
  startedAtMs: z.number().int().positive().optional(),
  finishedAtMs: z.number().int().positive(),
  orderId: z.string().trim().max(200).optional(),
  paymentReference: z.string().trim().max(200).optional(),
  paymentDueAtMs: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
});

export type ManualRunCreate = z.input<typeof manualRunCreateSchema>;

// ---- dashboard ----

export const DASHBOARD_RANGES = ["7d", "30d", "90d", "all"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export const dashboardQuerySchema = z.object({
  range: z.enum(DASHBOARD_RANGES).default("30d"),
});
