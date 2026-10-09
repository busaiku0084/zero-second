import type {
  NotificationKind,
  PaymentMethod,
  ReservationMode,
  ReservationStatus,
  RunDriver,
  RunResult,
  UserRole,
  WebhookKind,
} from "./schemas";
import type { SiteId } from "./sites";

/** API のレスポンス型。ログイン情報は返さない。 */
export type Account = {
  id: number;
  site: SiteId;
  loginId: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type Reservation = {
  id: number;
  site: SiteId;
  accountId: number | null;
  title: string;
  eventUrl: string;
  ticketType: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  saleStartsAtMs: number;
  mode: ReservationMode;
  notes: string;
  /** 販売開始の何分前に通知するか（多い順） */
  reminderMinutes: number[];
  status: ReservationStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type Run = {
  id: number;
  reservationId: number;
  mode: ReservationMode;
  /** 自動購入で使った操作の方法。手動購入と、これを記録する前の実行は null */
  driver: RunDriver | null;
  clockOffsetMs: number | null;
  startedAtMs: number;
  finishedAtMs: number | null;
  /** 販売開始から購入完了までのミリ秒 */
  elapsedMs: number | null;
  result: RunResult | null;
  error: string | null;
  orderId: string | null;
  paymentReference: string | null;
  paymentDueAtMs: number | null;
  notes: string;
};

export type Timing = {
  id: number;
  runId: number;
  phase: string;
  method: string;
  url: string;
  status: number | null;
  startedAtMs: number;
  durationMs: number;
};

export type RunWithTimings = Run & { timings: Timing[] };

export type DashboardSummary = {
  range: string;
  runCount: number;
  succeededCount: number;
  /** 成功した実行の所要時間（販売開始 → 完了）の中央値 */
  medianElapsedMs: number | null;
  fastestElapsedMs: number | null;
  resultCounts: Record<RunResult, number>;
  /** 所要時間の推移（成功・失敗を問わず、完了時刻つきの実行） */
  series: Array<{
    runId: number;
    reservationId: number;
    title: string;
    startedAtMs: number;
    elapsedMs: number;
    result: RunResult;
  }>;
  nextReservation: Reservation | null;
};

export type User = {
  id: number;
  loginId: string;
  role: UserRole;
  createdAtMs: number;
  /** 停止した時刻。null なら利用中 */
  disabledAtMs: number | null;
};

/** パスワードの再設定リンクを作ったときだけ返す */
export type PasswordResetCreated = { token: string; expiresAtMs: number };

/** ログイン・セットアップ・招待の受け入れが成功したときのレスポンス */
export type SessionResponse = {
  /** セッションのトークン。web が HttpOnly の Cookie に入れる */
  token: string;
  expiresAtMs: number;
  user: User;
};

export type Invitation = {
  id: number;
  note: string;
  createdAtMs: number;
  expiresAtMs: number;
  acceptedByLoginId: string | null;
  acceptedAtMs: number | null;
};

/** 招待を作ったときだけ返す。トークンは DB にハッシュしか残らないので、このとき以外は取り出せない */
export type InvitationCreated = Invitation & { token: string };

export type DeliveryStatus = "sent" | "failed" | "skipped";

export type Notification = {
  id: number;
  reservationId: number | null;
  kind: NotificationKind;
  title: string;
  body: string;
  /** 開く画面（web の中のパス） */
  url: string;
  pushStatus: DeliveryStatus | null;
  webhookStatus: DeliveryStatus | null;
  createdAtMs: number;
  readAtMs: number | null;
};

export type NotificationSummary = { unreadCount: number };

export type NotificationSettings = {
  /** Web Push の公開鍵。サーバーに鍵が設定されていなければ null（ブラウザ通知は使えない） */
  pushPublicKey: string | null;
  pushSubscriptionCount: number;
  /** 設定済みの Webhook の種類（URL そのものは返さない） */
  webhookKind: WebhookKind | null;
};

/** 予約の一覧の 1 件。チェックリストの進み具合つき */
export type ReservationListItem = Reservation & {
  checklistTotal: number;
  checklistDone: number;
};
