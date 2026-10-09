// 通知を作って届ける（ADR 0017）。
//
// - collect: 期限が来たリマインドと、終わった自動購入の結果から notifications の行を作る
// - deliver: 作った通知を Web Push と Webhook で送り、結果を行に残す
// Notifier（notifier.ts）が数秒おきに collect → deliver を呼ぶ

import type { DeliveryStatus, NotificationKind, RunResult, WebhookKind } from "@zero-second/shared";
import { decrypt } from "../lib/crypto.js";
import type { Db } from "../lib/db.js";
import { elapsedMs, type Row, reminderMinutes } from "../lib/rows.js";
import type { Senders } from "./channels.js";
import { formatJst, formatRemaining, formatSeconds } from "./text.js";

export type NewNotification = {
  userId: number;
  reservationId: number | null;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  dedupeKey: string;
};

/** 届ける前の通知（notifications の行） */
export type PendingNotification = NewNotification & { id: number };

/** これより先の販売開始は、リマインドの対象として読まない */
const MAX_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

const RESULT_KIND: Record<RunResult, NotificationKind> = {
  succeeded: "succeeded",
  needs_human: "needs_human",
  sold_out: "failed",
  failed: "failed",
};

export class NotificationService {
  constructor(
    private readonly db: Db,
    private readonly encryptionKey: Buffer,
    private readonly senders: Senders,
    /** 通知から開く web の URL のもと（例: http://127.0.0.1:47300） */
    private readonly appUrl: string,
  ) {}

  get pushEnabled(): boolean {
    return this.senders.push !== null;
  }

  /** 同じ dedupe_key の通知がまだなければ作る。作ったときだけ返す */
  insert(n: NewNotification, now = Date.now()): PendingNotification | null {
    const row = this.db
      .prepare(
        `INSERT INTO notifications (user_id, reservation_id, kind, title, body, url, dedupe_key, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id`,
      )
      .get(n.userId, n.reservationId, n.kind, n.title, n.body, n.url, n.dedupeKey, now) as
      | Row
      | undefined;
    return row ? { ...n, id: Number(row.id) } : null;
  }

  /** 期限が来たリマインドと、終わった自動購入の結果から通知を作る */
  collect(now = Date.now()): PendingNotification[] {
    return [...this.collectReminders(now), ...this.collectRunResults(now)];
  }

  /**
   * 販売開始の N 分前のリマインド。自動購入の予約は販売開始の 2 分前からワーカーが準備中（preparing）にするので、
   * 準備中の予約も対象にする。
   * 期限の来たもののうち、いちばん販売開始に近いものだけを作る
   * （30 分前と 5 分前の両方を過ぎてから登録した予約に、2 通まとめて送らないように）
   */
  private collectReminders(now: number): PendingNotification[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, title, sale_starts_at_ms, reminder_minutes FROM reservations
         WHERE status IN ('pending', 'preparing')
           AND user_id IN (SELECT id FROM users WHERE disabled_at_ms IS NULL)
           AND sale_starts_at_ms > ? AND sale_starts_at_ms <= ?`,
      )
      .all(now, now + MAX_REMINDER_MS) as Row[];
    const created: PendingNotification[] = [];
    for (const r of rows) {
      const saleAt = Number(r.sale_starts_at_ms);
      const due = reminderMinutes(r.reminder_minutes).filter((m) => saleAt - m * 60_000 <= now);
      if (due.length === 0) continue;
      const minutes = Math.min(...due);
      const n = this.insert(
        {
          userId: Number(r.user_id),
          reservationId: Number(r.id),
          kind: "reminder",
          title: `まもなく販売開始: ${String(r.title)}`,
          body: `${formatRemaining(saleAt - now)}（${formatJst(saleAt)}）`,
          url: `/reservations/${Number(r.id)}`,
          // 販売開始時刻を変えたら、もう一度知らせる
          dedupeKey: `reminder:${Number(r.id)}:${saleAt}:${minutes}`,
        },
        now,
      );
      if (n) created.push(n);
    }
    return created;
  }

  /** ワーカーが終えた自動購入の結果（手動の記録は本人が入力したものなので知らせない） */
  private collectRunResults(now: number): PendingNotification[] {
    const rows = this.db
      .prepare(
        `SELECT runs.id, runs.result, runs.error, runs.finished_at_ms, runs.clock_offset_ms,
                runs.payment_reference, reservations.id AS reservation_id, reservations.user_id,
                reservations.title, reservations.sale_starts_at_ms
         FROM runs JOIN reservations ON reservations.id = runs.reservation_id
         WHERE runs.mode = 'auto' AND runs.result IS NOT NULL AND runs.notified_at_ms IS NULL`,
      )
      .all() as Row[];
    const created: PendingNotification[] = [];
    for (const r of rows) {
      this.db.prepare("UPDATE runs SET notified_at_ms = ? WHERE id = ?").run(now, Number(r.id));
      if (r.user_id === null) continue;
      const result = String(r.result) as RunResult;
      const title = String(r.title);
      let heading: string;
      let body: string;
      if (result === "succeeded") {
        const elapsed =
          r.finished_at_ms === null
            ? null
            : elapsedMs(
                Number(r.finished_at_ms),
                Number(r.sale_starts_at_ms),
                r.clock_offset_ms === null ? null : Number(r.clock_offset_ms),
              );
        heading = `購入できました: ${title}`;
        body = [
          elapsed === null ? null : `販売開始から ${formatSeconds(elapsed)}`,
          r.payment_reference ? `払込番号 ${String(r.payment_reference)}` : null,
        ]
          .filter(Boolean)
          .join("。");
      } else if (result === "needs_human") {
        heading = `対応が必要です: ${title}`;
        body = `${String(r.error ?? "")} サイトを開いて続きを操作してください。`.trim();
      } else {
        heading = `購入できませんでした: ${title}`;
        body = result === "sold_out" ? "売り切れでした" : String(r.error ?? "");
      }
      const n = this.insert(
        {
          userId: Number(r.user_id),
          reservationId: Number(r.reservation_id),
          kind: RESULT_KIND[result],
          title: heading,
          body,
          url: `/reservations/${Number(r.reservation_id)}`,
          dedupeKey: `run:${Number(r.id)}`,
        },
        now,
      );
      if (n) created.push(n);
    }
    return created;
  }

  /** Web Push と Webhook で送り、結果を残す。経路を設定していなければ skipped */
  async deliver(n: PendingNotification): Promise<{
    pushStatus: DeliveryStatus;
    webhookStatus: DeliveryStatus;
  }> {
    const [pushStatus, webhookStatus] = await Promise.all([
      this.deliverPush(n),
      this.deliverWebhook(n),
    ]);
    this.db
      .prepare("UPDATE notifications SET push_status = ?, webhook_status = ? WHERE id = ?")
      .run(pushStatus, webhookStatus, n.id);
    return { pushStatus, webhookStatus };
  }

  private async deliverPush(n: PendingNotification): Promise<DeliveryStatus> {
    const send = this.senders.push;
    if (!send) return "skipped";
    const targets = this.db
      .prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
      .all(n.userId) as Row[];
    if (targets.length === 0) return "skipped";
    const payload = JSON.stringify({
      title: n.title,
      body: n.body,
      url: n.url,
      tag: `zero-second-${n.id}`,
    });
    const results = await Promise.all(
      targets.map(async (t) => {
        const result = await send(
          { endpoint: String(t.endpoint), p256dh: String(t.p256dh), auth: String(t.auth) },
          payload,
        );
        // ブラウザ側で解除された購読は消す
        if (result === "gone") {
          this.db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(Number(t.id));
        }
        return result;
      }),
    );
    return results.includes("ok") ? "sent" : "failed";
  }

  private async deliverWebhook(n: PendingNotification): Promise<DeliveryStatus> {
    const row = this.db
      .prepare(
        "SELECT encrypted_webhook_url, webhook_kind FROM notification_settings WHERE user_id = ?",
      )
      .get(n.userId) as Row | undefined;
    if (!row || row.encrypted_webhook_url === null) return "skipped";
    let url: string;
    try {
      url = decrypt(this.encryptionKey, row.encrypted_webhook_url as Uint8Array);
    } catch {
      return "failed";
    }
    const kind = String(row.webhook_kind) as WebhookKind;
    const bold = kind === "discord" ? `**${n.title}**` : `*${n.title}*`;
    const text = [bold, n.body, `${this.appUrl}${n.url}`].filter(Boolean).join("\n");
    return (await this.senders.webhook(url, kind, text)) ? "sent" : "failed";
  }
}
