import { zValidator } from "@hono/zod-validator";
import {
  type NotificationSettings,
  pushSubscriptionSchema,
  webhookKind,
  webhookUpdateSchema,
} from "@zero-second/shared";
import { Hono } from "hono";
import { z } from "zod";
import { encrypt } from "../lib/crypto.js";
import { type Row, toNotification } from "../lib/rows.js";
import { isAllowedPushEndpoint } from "../notify/channels.js";
import type { AppEnv } from "../types.js";
import { validationHook } from "./params.js";

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

// 本人の通知と、通知の届け先の設定（ADR 0017）
export const notifications = new Hono<AppEnv>()
  .get("/", zValidator("query", listQuery, validationHook), (c) => {
    const { limit } = c.req.valid("query");
    const rows = c.var.db
      .prepare(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at_ms DESC, id DESC LIMIT ?",
      )
      .all(c.var.user.id, limit);
    return c.json(rows.map((r) => toNotification(r as Row)));
  })
  .get("/summary", (c) => {
    const row = c.var.db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at_ms IS NULL")
      .get(c.var.user.id) as Row;
    return c.json({ unreadCount: Number(row.n) });
  })
  // すべて既読にする
  .post("/read", (c) => {
    c.var.db
      .prepare("UPDATE notifications SET read_at_ms = ? WHERE user_id = ? AND read_at_ms IS NULL")
      .run(Date.now(), c.var.user.id);
    return c.body(null, 204);
  })
  .get("/settings", (c) => {
    const userId = c.var.user.id;
    const count = c.var.db
      .prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?")
      .get(userId) as Row;
    const settings = c.var.db
      .prepare(
        "SELECT webhook_kind FROM notification_settings WHERE user_id = ? AND encrypted_webhook_url IS NOT NULL",
      )
      .get(userId) as Row | undefined;
    const body: NotificationSettings = {
      pushPublicKey: c.var.pushPublicKey,
      pushSubscriptionCount: Number(count.n),
      webhookKind: settings
        ? (String(settings.webhook_kind) as NotificationSettings["webhookKind"])
        : null,
    };
    return c.json(body);
  })
  // Webhook（Discord / Slack）の URL を設定する。null で解除。URL は暗号化して保存し、返さない
  .put("/webhook", zValidator("json", webhookUpdateSchema, validationHook), (c) => {
    const { webhookUrl } = c.req.valid("json");
    const now = Date.now();
    c.var.db
      .prepare(
        `INSERT INTO notification_settings (user_id, encrypted_webhook_url, webhook_kind, updated_at_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET
           encrypted_webhook_url = excluded.encrypted_webhook_url,
           webhook_kind = excluded.webhook_kind,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run(
        c.var.user.id,
        webhookUrl === null ? null : encrypt(c.var.encryptionKey, webhookUrl),
        webhookUrl === null ? null : webhookKind(webhookUrl),
        now,
      );
    return c.body(null, 204);
  })
  // ブラウザ通知の購読を登録する。同じブラウザで別のユーザーがログインしたら、そのユーザーに付け替える
  .post("/push-subscriptions", zValidator("json", pushSubscriptionSchema, validationHook), (c) => {
    if (!c.var.pushPublicKey) {
      return c.json({ error: "サーバーにブラウザ通知の鍵が設定されていません" }, 409);
    }
    const { endpoint, keys } = c.req.valid("json");
    if (!isAllowedPushEndpoint(endpoint)) {
      return c.json({ error: "このブラウザのプッシュ通知の送り先には対応していません" }, 400);
    }
    c.var.db
      .prepare(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at_ms)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET
           user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run(c.var.user.id, endpoint, keys.p256dh, keys.auth, Date.now());
    return c.body(null, 201);
  })
  .delete(
    "/push-subscriptions",
    zValidator("json", z.object({ endpoint: z.string().max(2048) }), validationHook),
    (c) => {
      const { endpoint } = c.req.valid("json");
      c.var.db
        .prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
        .run(c.var.user.id, endpoint);
      return c.body(null, 204);
    },
  )
  // 設定した経路に試しに送る
  .post("/test", async (c) => {
    const now = Date.now();
    const n = c.var.notifications.insert(
      {
        userId: c.var.user.id,
        reservationId: null,
        kind: "test",
        title: "zero-second のテスト通知",
        body: "この通知が届いていれば、設定は正しくできています",
        url: "/notifications",
        dedupeKey: `test:${now}:${Math.random().toString(36).slice(2)}`,
      },
      now,
    );
    if (!n) return c.json({ error: "通知を作れませんでした" }, 500);
    return c.json(await c.var.notifications.deliver(n));
  });
