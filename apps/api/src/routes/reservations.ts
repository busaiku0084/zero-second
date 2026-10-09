import { zValidator } from "@hono/zod-validator";
import {
  checklistItemCreateSchema,
  checklistItemUpdateSchema,
  checklistTemplate,
  EVENT_URL_MESSAGE,
  eventUrlMatchesSite,
  findSite,
  manualRunCreateSchema,
  type ReservationStatus,
  type RunResult,
  reservationCreateSchema,
  reservationUpdateSchema,
} from "@zero-second/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../lib/db.js";
import { type Row, toChecklistItem, toReservation, toRun } from "../lib/rows.js";
import type { AppEnv } from "../types.js";
import { idParam, validationHook } from "./params.js";

const itemParam = idParam.extend({ itemId: z.coerce.number().int().positive() });

const RUN_COLUMNS = "runs.*, reservations.sale_starts_at_ms";

/** 実行中の予約は編集・削除できない */
const LOCKED_STATUSES: ReservationStatus[] = ["preparing", "running"];

const RESULT_TO_STATUS: Record<RunResult, ReservationStatus> = {
  succeeded: "succeeded",
  sold_out: "failed",
  failed: "failed",
  needs_human: "needs_human",
};

/** ほかのユーザーの予約は「見つからない」として扱う */
function getReservation(db: Db, userId: number, id: number) {
  const row = db.prepare("SELECT * FROM reservations WHERE id = ? AND user_id = ?").get(id, userId);
  return row ? toReservation(row as Row) : null;
}

function checklistOf(db: Db, reservationId: number) {
  return db
    .prepare("SELECT * FROM checklist_items WHERE reservation_id = ? ORDER BY position, id")
    .all(reservationId)
    .map((r) => toChecklistItem(r as Row));
}

/** 項目を末尾に足す */
function appendChecklist(db: Db, reservationId: number, labels: string[]) {
  const last = db
    .prepare("SELECT COALESCE(MAX(position), 0) AS p FROM checklist_items WHERE reservation_id = ?")
    .get(reservationId) as Row;
  const insert = db.prepare(
    `INSERT INTO checklist_items (reservation_id, label, position, created_at_ms)
     VALUES (?, ?, ?, ?) RETURNING *`,
  );
  const now = Date.now();
  return labels.map((label, i) =>
    toChecklistItem(insert.get(reservationId, label, Number(last.p) + i + 1, now) as Row),
  );
}

/** アカウントが本人のもので、予約と同じサイトのものかを確認する */
function accountMatchesSite(db: Db, userId: number, accountId: number, site: string): boolean {
  return Boolean(
    db
      .prepare("SELECT 1 FROM accounts WHERE id = ? AND user_id = ? AND site = ?")
      .get(accountId, userId, site),
  );
}

export const reservations = new Hono<AppEnv>()
  .get("/", (c) => {
    const rows = c.var.db
      .prepare(
        `SELECT reservations.*,
           (SELECT COUNT(*) FROM checklist_items WHERE reservation_id = reservations.id) AS checklist_total,
           (SELECT COUNT(*) FROM checklist_items
            WHERE reservation_id = reservations.id AND done_at_ms IS NOT NULL) AS checklist_done
         FROM reservations WHERE user_id = ? ORDER BY sale_starts_at_ms DESC`,
      )
      .all(c.var.user.id) as Row[];
    return c.json(
      rows.map((r) => ({
        ...toReservation(r),
        checklistTotal: Number(r.checklist_total),
        checklistDone: Number(r.checklist_done),
      })),
    );
  })
  .get("/:id", zValidator("param", idParam, validationHook), (c) => {
    const { id } = c.req.valid("param");
    const reservation = getReservation(c.var.db, c.var.user.id, id);
    if (!reservation) return c.json({ error: "予約が見つかりません" }, 404);
    const runs = c.var.db
      .prepare(
        `SELECT ${RUN_COLUMNS} FROM runs JOIN reservations ON reservations.id = runs.reservation_id
         WHERE runs.reservation_id = ? ORDER BY runs.started_at_ms DESC`,
      )
      .all(id)
      .map((r) => toRun(r as Row));
    return c.json({ ...reservation, runs, checklist: checklistOf(c.var.db, id) });
  })
  .post("/", zValidator("json", reservationCreateSchema, validationHook), (c) => {
    const body = c.req.valid("json");
    if (
      body.accountId !== null &&
      !accountMatchesSite(c.var.db, c.var.user.id, body.accountId, body.site)
    ) {
      return c.json({ error: "このサイトのアカウントではありません" }, 400);
    }
    const now = Date.now();
    const db = c.var.db;
    db.exec("BEGIN");
    let row: Row;
    try {
      row = db
        .prepare(
          `INSERT INTO reservations (
           user_id, account_id, site, title, event_url, ticket_type, quantity, payment_method,
           sale_starts_at_ms, mode, notes, reminder_minutes, status, created_at_ms, updated_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING *`,
        )
        .get(
          c.var.user.id,
          body.accountId,
          body.site,
          body.title,
          body.eventUrl,
          body.ticketType,
          body.quantity,
          body.paymentMethod,
          body.saleStartsAtMs,
          body.mode,
          body.notes,
          JSON.stringify(body.reminderMinutes),
          now,
          now,
        ) as Row;
      // 購入前チェックリストはサイトのテンプレートから入れる（#13）
      appendChecklist(db, Number(row.id), checklistTemplate(body.site, body.mode));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return c.json(toReservation(row), 201);
  })
  .patch(
    "/:id",
    zValidator("param", idParam, validationHook),
    zValidator("json", reservationUpdateSchema, validationHook),
    (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const current = getReservation(c.var.db, c.var.user.id, id);
      if (!current) return c.json({ error: "予約が見つかりません" }, 404);
      if (LOCKED_STATUSES.includes(current.status)) {
        return c.json({ error: "実行中の予約は変更できません" }, 409);
      }
      const site = findSite(current.site);
      if (body.eventUrl !== undefined && site && !eventUrlMatchesSite(site, body.eventUrl)) {
        return c.json({ error: EVENT_URL_MESSAGE }, 400);
      }
      if (body.mode === "auto" && site?.automation !== "auto") {
        return c.json({ error: "このサイトは利用規約により自動購入に対応していません" }, 400);
      }
      if (
        body.accountId !== undefined &&
        body.accountId !== null &&
        !accountMatchesSite(c.var.db, c.var.user.id, body.accountId, current.site)
      ) {
        return c.json({ error: "このサイトのアカウントではありません" }, 400);
      }

      const columns: Record<string, string> = {
        accountId: "account_id",
        title: "title",
        eventUrl: "event_url",
        ticketType: "ticket_type",
        quantity: "quantity",
        paymentMethod: "payment_method",
        saleStartsAtMs: "sale_starts_at_ms",
        mode: "mode",
        notes: "notes",
        status: "status",
      };
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
      for (const [key, column] of Object.entries(columns)) {
        const value = (body as Record<string, string | number | null | undefined>)[key];
        if (value === undefined) continue;
        sets.push(`${column} = ?`);
        values.push(value);
      }
      if (body.reminderMinutes !== undefined) {
        sets.push("reminder_minutes = ?");
        values.push(JSON.stringify(body.reminderMinutes));
      }
      sets.push("updated_at_ms = ?");
      values.push(Date.now());

      const row = c.var.db
        .prepare(`UPDATE reservations SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
        .get(...values, id);
      return c.json(toReservation(row as Row));
    },
  )
  .delete("/:id", zValidator("param", idParam, validationHook), (c) => {
    const { id } = c.req.valid("param");
    const current = getReservation(c.var.db, c.var.user.id, id);
    if (!current) return c.json({ error: "予約が見つかりません" }, 404);
    if (LOCKED_STATUSES.includes(current.status)) {
      return c.json({ error: "実行中の予約は削除できません" }, 409);
    }
    const db = c.var.db;
    db.exec("BEGIN");
    try {
      db.prepare(
        "DELETE FROM timings WHERE run_id IN (SELECT id FROM runs WHERE reservation_id = ?)",
      ).run(id);
      db.prepare("DELETE FROM runs WHERE reservation_id = ?").run(id);
      db.prepare("DELETE FROM reservations WHERE id = ?").run(id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return c.body(null, 204);
  })
  // 手で購入した結果を記録する（#14）
  .post(
    "/:id/manual-runs",
    zValidator("param", idParam, validationHook),
    zValidator("json", manualRunCreateSchema, validationHook),
    (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const reservation = getReservation(c.var.db, c.var.user.id, id);
      if (!reservation) return c.json({ error: "予約が見つかりません" }, 404);
      if (reservation.mode !== "manual") {
        return c.json({ error: "自動購入の予約には手動の記録を追加できません" }, 409);
      }
      const startedAtMs = body.startedAtMs ?? reservation.saleStartsAtMs;
      if (body.finishedAtMs < startedAtMs) {
        return c.json({ error: "完了時刻が開始時刻より前になっています" }, 400);
      }

      const db = c.var.db;
      let runId: number;
      db.exec("BEGIN");
      try {
        const inserted = db
          .prepare(
            `INSERT INTO runs (
               reservation_id, mode, started_at_ms, finished_at_ms, result,
               order_id, payment_reference, payment_due_at_ms, notes
             ) VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          )
          .get(
            id,
            startedAtMs,
            body.finishedAtMs,
            body.result,
            body.orderId ?? null,
            body.paymentReference ?? null,
            body.paymentDueAtMs ?? null,
            body.notes ?? "",
          ) as Row;
        db.prepare("UPDATE reservations SET status = ?, updated_at_ms = ? WHERE id = ?").run(
          RESULT_TO_STATUS[body.result],
          Date.now(),
          id,
        );
        db.exec("COMMIT");
        runId = Number(inserted.id);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      const row = db
        .prepare(
          `SELECT ${RUN_COLUMNS} FROM runs JOIN reservations ON reservations.id = runs.reservation_id
           WHERE runs.id = ?`,
        )
        .get(runId);
      return c.json(toRun(row as Row), 201);
    },
  )
  // ---- 購入前チェックリスト（#13） ----
  .post(
    "/:id/checklist",
    zValidator("param", idParam, validationHook),
    zValidator("json", checklistItemCreateSchema, validationHook),
    (c) => {
      const { id } = c.req.valid("param");
      if (!getReservation(c.var.db, c.var.user.id, id)) {
        return c.json({ error: "予約が見つかりません" }, 404);
      }
      const [item] = appendChecklist(c.var.db, id, [c.req.valid("json").label]);
      return c.json(item, 201);
    },
  )
  // テンプレートの項目を足す（チェックリストより前に作った予約など）
  .post("/:id/checklist/template", zValidator("param", idParam, validationHook), (c) => {
    const { id } = c.req.valid("param");
    const reservation = getReservation(c.var.db, c.var.user.id, id);
    if (!reservation) return c.json({ error: "予約が見つかりません" }, 404);
    const existing = new Set(checklistOf(c.var.db, id).map((i) => i.label));
    appendChecklist(
      c.var.db,
      id,
      checklistTemplate(reservation.site, reservation.mode).filter((label) => !existing.has(label)),
    );
    return c.json(checklistOf(c.var.db, id), 201);
  })
  .patch(
    "/:id/checklist/:itemId",
    zValidator("param", itemParam, validationHook),
    zValidator("json", checklistItemUpdateSchema, validationHook),
    (c) => {
      const { id, itemId } = c.req.valid("param");
      if (!getReservation(c.var.db, c.var.user.id, id)) {
        return c.json({ error: "予約が見つかりません" }, 404);
      }
      const row = c.var.db
        .prepare(
          "UPDATE checklist_items SET done_at_ms = ? WHERE id = ? AND reservation_id = ? RETURNING *",
        )
        .get(c.req.valid("json").done ? Date.now() : null, itemId, id);
      if (!row) return c.json({ error: "項目が見つかりません" }, 404);
      return c.json(toChecklistItem(row as Row));
    },
  )
  .delete("/:id/checklist/:itemId", zValidator("param", itemParam, validationHook), (c) => {
    const { id, itemId } = c.req.valid("param");
    if (!getReservation(c.var.db, c.var.user.id, id)) {
      return c.json({ error: "予約が見つかりません" }, 404);
    }
    const res = c.var.db
      .prepare("DELETE FROM checklist_items WHERE id = ? AND reservation_id = ?")
      .run(itemId, id);
    if (res.changes === 0) return c.json({ error: "項目が見つかりません" }, 404);
    return c.body(null, 204);
  });
