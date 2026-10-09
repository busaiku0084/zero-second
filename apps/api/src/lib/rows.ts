import type {
  Account,
  DeliveryStatus,
  Invitation,
  Notification,
  NotificationKind,
  PaymentMethod,
  Reservation,
  ReservationMode,
  ReservationStatus,
  Run,
  RunResult,
  SiteId,
  Timing,
  User,
  UserRole,
} from "@zero-second/shared";

/** node:sqlite の行（列名 → 値） */
export type Row = Record<string, unknown>;

/** reservations.reminder_minutes（JSON の配列）。壊れていたら通知しない */
export function reminderMinutes(v: unknown): number[] {
  try {
    const parsed: unknown = JSON.parse(String(v ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

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
    reminderMinutes: reminderMinutes(r.reminder_minutes),
    status: str(r.status) as ReservationStatus,
    createdAtMs: num(r.created_at_ms),
    updatedAtMs: num(r.updated_at_ms),
  };
}

/**
 * 販売開始から購入完了までの所要時間。
 *
 * finished_at_ms は端末の時計、sale_starts_at_ms はサイト（サーバー）の時計なので、
 * ワーカーが測ったずれ（サーバー − 端末）を足してサーバーの時計にそろえてから引く。
 */
export function elapsedMs(
  finishedAtMs: number,
  saleStartsAtMs: number,
  clockOffsetMs: number | null,
): number {
  return finishedAtMs + (clockOffsetMs ?? 0) - saleStartsAtMs;
}

/** runs と reservations.sale_starts_at_ms を結合した行から変換する */
export function toRun(r: Row): Run {
  const finishedAtMs = numOrNull(r.finished_at_ms);
  const saleStartsAtMs = numOrNull(r.sale_starts_at_ms);
  const clockOffsetMs = numOrNull(r.clock_offset_ms);
  return {
    id: num(r.id),
    reservationId: num(r.reservation_id),
    mode: str(r.mode) as ReservationMode,
    clockOffsetMs,
    startedAtMs: num(r.started_at_ms),
    finishedAtMs,
    elapsedMs:
      finishedAtMs !== null && saleStartsAtMs !== null
        ? elapsedMs(finishedAtMs, saleStartsAtMs, clockOffsetMs)
        : null,
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

export function toUser(r: Row): User {
  return {
    id: num(r.id),
    loginId: str(r.login_id),
    role: str(r.role) as UserRole,
    createdAtMs: num(r.created_at_ms),
  };
}

/** invitations と、受け入れたユーザーの login_id（accepted_by_login_id）を結合した行から変換する */
export function toInvitation(r: Row): Invitation {
  return {
    id: num(r.id),
    note: str(r.note),
    createdAtMs: num(r.created_at_ms),
    expiresAtMs: num(r.expires_at_ms),
    acceptedByLoginId: strOrNull(r.accepted_by_login_id),
    acceptedAtMs: numOrNull(r.accepted_at_ms),
  };
}

export function toNotification(r: Row): Notification {
  return {
    id: num(r.id),
    reservationId: numOrNull(r.reservation_id),
    kind: str(r.kind) as NotificationKind,
    title: str(r.title),
    body: str(r.body),
    url: str(r.url),
    pushStatus: strOrNull(r.push_status) as DeliveryStatus | null,
    webhookStatus: strOrNull(r.webhook_status) as DeliveryStatus | null,
    createdAtMs: num(r.created_at_ms),
    readAtMs: numOrNull(r.read_at_ms),
  };
}
