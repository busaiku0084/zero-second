import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type Row, toRun, toTiming } from "../lib/rows.js";
import type { AppEnv } from "../types.js";
import { idParam, validationHook } from "./params.js";

export const runs = new Hono<AppEnv>().get(
  "/:id",
  zValidator("param", idParam, validationHook),
  (c) => {
    const { id } = c.req.valid("param");
    const row = c.var.db
      .prepare(
        `SELECT runs.*, reservations.sale_starts_at_ms
         FROM runs JOIN reservations ON reservations.id = runs.reservation_id
         WHERE runs.id = ? AND reservations.user_id = ?`,
      )
      .get(id, c.var.user.id);
    if (!row) return c.json({ error: "実行結果が見つかりません" }, 404);
    const timings = c.var.db
      .prepare("SELECT * FROM timings WHERE run_id = ? ORDER BY started_at_ms, id")
      .all(id)
      .map((r) => toTiming(r as Row));
    return c.json({ ...toRun(row as Row), timings });
  },
);
