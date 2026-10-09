import { zValidator } from "@hono/zod-validator";
import { SITE_IDS } from "@zero-second/shared";
import { Hono } from "hono";
import { z } from "zod";
import { EventInfoError, resolveEventInfo } from "../lib/event-info.js";
import type { AppEnv } from "../types.js";
import { validationHook } from "./params.js";

const querySchema = z.object({
  site: z.enum(SITE_IDS),
  url: z.url().max(2048),
});

/** 公演 URL から公演情報を読む（予約の登録画面の自動入力。#43）。ログイン必須 */
export const eventInfo = new Hono<AppEnv>().get(
  "/",
  zValidator("query", querySchema, validationHook),
  async (c) => {
    const { site, url } = c.req.valid("query");
    try {
      return c.json(await resolveEventInfo(site, url, c.var.eventInfo));
    } catch (e) {
      if (e instanceof EventInfoError) return c.json({ error: e.message }, e.status);
      throw e;
    }
  },
);
