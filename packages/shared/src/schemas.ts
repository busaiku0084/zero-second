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

/** 販売開始の何分前に知らせるかの選択肢 */
export const REMINDER_MINUTE_OPTIONS = [1440, 60, 30, 5, 1] as const;
export const DEFAULT_REMINDER_MINUTES = [30, 5];

export const reminderMinutesSchema = z
  .array(
    z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60),
  )
  .max(5)
  .transform((v) => [...new Set(v)].sort((a, b) => b - a));

/** 予約の項目（既定値なし）。更新は送られた項目だけを変えるので、既定値を付けない */
const reservationFieldsBase = z.object({
  site: z.enum(SITE_IDS),
  accountId: z.number().int().positive().nullable(),
  title: z.string().trim().min(1).max(200),
  eventUrl: z.url().max(2048),
  ticketType: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(10),
  paymentMethod: z.enum(PAYMENT_METHODS),
  saleStartsAtMs: z.number().int().positive(),
  mode: z.enum(RESERVATION_MODES),
  notes: z.string().max(2000),
  /** 販売開始の何分前に通知するか（ADR 0017） */
  reminderMinutes: reminderMinutesSchema,
});

/**
 * 作成時の項目。省略できる項目に既定値を付ける。
 * 注意: zod 4 の .partial() は既定値を残すため、更新のスキーマはこちらから作らない
 */
const reservationFields = reservationFieldsBase.extend({
  accountId: reservationFieldsBase.shape.accountId.default(null),
  paymentMethod: reservationFieldsBase.shape.paymentMethod.default("convenience_store"),
  mode: reservationFieldsBase.shape.mode.default("manual"),
  notes: reservationFieldsBase.shape.notes.default(""),
  reminderMinutes: reservationFieldsBase.shape.reminderMinutes.default(DEFAULT_REMINDER_MINUTES),
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

export const reservationUpdateSchema = reservationFieldsBase
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

// ---- users・ログイン（ADR 0016） ----

export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PASSWORD_MIN_LENGTH = 10;

const userLoginId = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_.-]+$/, "半角英数字と _ . - だけが使えます");

const newPassword = z.string().min(PASSWORD_MIN_LENGTH).max(128);

export const loginSchema = z.object({
  loginId: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
});

/** 初回セットアップ・招待の受け入れで、ユーザーを作るときの入力 */
export const signupSchema = z.object({
  loginId: userLoginId,
  password: newPassword,
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword,
});

export const invitationCreateSchema = z.object({
  note: z.string().trim().max(100).default(""),
});

export type Login = z.infer<typeof loginSchema>;
export type Signup = z.infer<typeof signupSchema>;
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
export type InvitationCreate = z.input<typeof invitationCreateSchema>;

// ---- 通知（ADR 0017） ----

export const NOTIFICATION_KINDS = [
  "reminder",
  "needs_human",
  "succeeded",
  "failed",
  "test",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Webhook に使える URL（Discord / Slack の受信用 Webhook だけ） */
export const WEBHOOK_PREFIXES = {
  discord: ["https://discord.com/api/webhooks/", "https://discordapp.com/api/webhooks/"],
  slack: ["https://hooks.slack.com/services/"],
} as const;
export type WebhookKind = keyof typeof WEBHOOK_PREFIXES;

export function webhookKind(url: string): WebhookKind | null {
  for (const [kind, prefixes] of Object.entries(WEBHOOK_PREFIXES)) {
    if (prefixes.some((p) => url.startsWith(p))) return kind as WebhookKind;
  }
  return null;
}

export const webhookUpdateSchema = z.object({
  /** null で解除 */
  webhookUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => webhookKind(v) !== null, "Discord か Slack の Webhook の URL を入力してください")
    .nullable(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export type WebhookUpdate = z.infer<typeof webhookUpdateSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
