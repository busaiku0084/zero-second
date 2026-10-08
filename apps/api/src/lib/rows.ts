import type {
  Account,
  PaymentMethod,
  Reservation,
  ReservationMode,
  ReservationStatus,
  Run,
  RunResult,
  SiteId,
  Timing,
} from "@zero-second/shared";

/** node:sqlite の行（列名 → 値） */
export type Row = Record<string, unknown>;

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string => String(v ?? "");
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function toAccount(r: Row): Account {
  return {
    id: num(r.id),
    site: str(r.site) as SiteId,
    loginId: str(r.login_id),
    createdAtMs: num(r.created_at_ms),
    updatedAtMs: num(r.updated_at_ms),
  };
}

export function toReservation(r: Row): Reservation {
  return {
    id: num(r.id),
    site: str(r.site) as SiteId,
    accountId: numOrNull(r.account_id),
    title: str(r.title),
    eventUrl: str(r.event_url),
    ticketType: str(r.ticket_type),
    quantity: num(r.quantity),
    paymentMethod: str(r.payment_method) as PaymentMethod,
    saleStartsAtMs: num(r.sale_starts_at_ms),
    mode: str(r.mode) as ReservationMode,
    notes: str(r.notes),
    status: str(r.status) as ReservationStatus,
    createdAtMs: num(r.created_at_ms),
    updatedAtMs: num(r.updated_at_ms),
  };
}

/** runs と reservations.sale_starts_at_ms を結合した行から変換する */
export function toRun(r: Row): Run {
  const finishedAtMs = numOrNull(r.finished_at_ms);
  const saleStartsAtMs = numOrNull(r.sale_starts_at_ms);
  return {
    id: num(r.id),
    reservationId: num(r.reservation_id),
    mode: str(r.mode) as ReservationMode,
    clockOffsetMs: numOrNull(r.clock_offset_ms),
    startedAtMs: num(r.started_at_ms),
    finishedAtMs,
    elapsedMs:
      finishedAtMs !== null && saleStartsAtMs !== null ? finishedAtMs - saleStartsAtMs : null,
    result: strOrNull(r.result) as RunResult | null,
    error: strOrNull(r.error),
    orderId: strOrNull(r.order_id),
    paymentReference: strOrNull(r.payment_reference),
    paymentDueAtMs: numOrNull(r.payment_due_at_ms),
    notes: str(r.notes),
  };
}

export function toTiming(r: Row): Timing {
  return {
    id: num(r.id),
    runId: num(r.run_id),
    phase: str(r.phase),
    method: str(r.method),
    url: str(r.url),
    status: numOrNull(r.status),
    startedAtMs: num(r.started_at_ms),
    durationMs: num(r.duration_ms),
  };
}
