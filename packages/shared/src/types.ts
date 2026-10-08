import type { PaymentMethod, ReservationMode, ReservationStatus, RunResult } from "./schemas";
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
  status: ReservationStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type Run = {
  id: number;
  reservationId: number;
  mode: ReservationMode;
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
