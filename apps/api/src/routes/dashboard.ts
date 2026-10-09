import { zValidator } from "@hono/zod-validator";
import {
  type DashboardRange,
  type DashboardSummary,
  dashboardQuerySchema,
  RUN_RESULTS,
  type RunResult,
} from "@zero-second/shared";
import { Hono } from "hono";
import { elapsedMs, type Row, toReservation } from "../lib/rows.js";
import type { AppEnv } from "../types.js";
import { validationHook } from "./params.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<DashboardRange, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] as number;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] as number) + upper) / 2;
}

export const dashboard = new Hono<AppEnv>().get(
  "/",
  zValidator("query", dashboardQuerySchema, validationHook),
  (c) => {
    const { range } = c.req.valid("query");
    const now = Date.now();
    const days = RANGE_DAYS[range];
    const since = days === null ? 0 : now - days * DAY_MS;

    const rows = c.var.db
      .prepare(
        `SELECT runs.id, runs.reservation_id, runs.started_at_ms, runs.finished_at_ms, runs.result,
                runs.clock_offset_ms,
                reservations.title, reservations.sale_starts_at_ms
         FROM runs JOIN reservations ON reservations.id = runs.reservation_id
         WHERE reservations.user_id = ? AND runs.started_at_ms >= ? AND runs.result IS NOT NULL
         ORDER BY runs.started_at_ms`,
      )
      .all(c.var.user.id, since) as Row[];

    const resultCounts = Object.fromEntries(RUN_RESULTS.map((r) => [r, 0])) as Record<
      RunResult,
      number
    >;
    const series: DashboardSummary["series"] = [];
    for (const r of rows) {
      const result = String(r.result) as RunResult;
      resultCounts[result] += 1;
      if (r.finished_at_ms === null) continue;
      series.push({
        runId: Number(r.id),
        reservationId: Number(r.reservation_id),
        title: String(r.title),
        startedAtMs: Number(r.started_at_ms),
        elapsedMs: elapsedMs(
          Number(r.finished_at_ms),
          Number(r.sale_starts_at_ms),
          r.clock_offset_ms === null ? null : Number(r.clock_offset_ms),
        ),
        result,
      });
    }
    const succeeded = series.filter((s) => s.result === "succeeded").map((s) => s.elapsedMs);

    const next = c.var.db
      .prepare(
        `SELECT * FROM reservations
         WHERE user_id = ? AND status = 'pending' AND sale_starts_at_ms >= ?
         ORDER BY sale_starts_at_ms LIMIT 1`,
      )
      .get(c.var.user.id, now);

    const summary: DashboardSummary = {
      range,
      runCount: rows.length,
      succeededCount: resultCounts.succeeded,
      medianElapsedMs: median(succeeded),
      fastestElapsedMs: succeeded.length > 0 ? Math.min(...succeeded) : null,
      resultCounts,
      series,
      nextReservation: next ? toReservation(next as Row) : null,
    };
    return c.json(summary);
  },
);
