import { SITES } from "@zero-second/shared";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";
import type { Db } from "./lib/db.js";
import type { EventInfoOptions } from "./lib/event-info.js";
import { LoginLimiter } from "./lib/rate-limit.js";
import { realSenders, type Senders, type VapidConfig } from "./notify/channels.js";
import { NotificationService } from "./notify/service.js";
import { accounts } from "./routes/accounts.js";
import { auth, requireSession } from "./routes/auth.js";
import { dashboard } from "./routes/dashboard.js";
import { eventInfo } from "./routes/event-info.js";
import { notifications } from "./routes/notifications.js";
import { reservations } from "./routes/reservations.js";
import { runs } from "./routes/runs.js";
import { invitations, users } from "./routes/users.js";
import type { AppEnv } from "./types.js";

export type AppOptions = {
  db: Db;
  encryptionKey: Buffer;
  /** 設定時は Authorization: Bearer <token> を必須にする */
  apiToken?: string;
  loginLimiter?: LoginLimiter;
  /** Web Push の鍵（未設定ならブラウザ通知は使わない） */
  vapid?: VapidConfig | null;
  /** 通知の送り方（テストで差し替える） */
  senders?: Senders;
  /** 通知から開く web の URL のもと */
  appUrl?: string;
  /** Notifier と共有するとき（index.ts）に渡す。無ければ作る */
  notificationService?: NotificationService;
  /** 公演情報の自動入力の接続先（テストで fetch を差し替える） */
  eventInfo?: EventInfoOptions;
};

export function createApp({
  db,
  encryptionKey,
  apiToken,
  loginLimiter = new LoginLimiter(),
  vapid = null,
  senders = realSenders(vapid),
  appUrl = "http://127.0.0.1:47300",
  notificationService = new NotificationService(db, encryptionKey, senders, appUrl),
  eventInfo: eventInfoOptions = { mockSiteUrl: "http://127.0.0.1:47302" },
}: AppOptions) {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  if (apiToken) app.use("/*", bearerAuth({ token: apiToken }));

  app.use("/*", async (c, next) => {
    c.set("db", db);
    c.set("encryptionKey", encryptionKey);
    c.set("loginLimiter", loginLimiter);
    c.set("notifications", notificationService);
    c.set("pushPublicKey", vapid?.publicKey ?? null);
    c.set("eventInfo", eventInfoOptions);
    await next();
  });

  // 公開のルート以外は、ログイン中のユーザーのセッションが必要（ADR 0016）
  app.use("/*", requireSession);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "サーバーでエラーが発生しました" }, 500);
  });

  return app
    .get("/sites", (c) => c.json(SITES))
    .route("/auth", auth)
    .route("/users", users)
    .route("/invitations", invitations)
    .route("/accounts", accounts)
    .route("/reservations", reservations)
    .route("/runs", runs)
    .route("/dashboard", dashboard)
    .route("/event-info", eventInfo)
    .route("/notifications", notifications);
}

export type App = ReturnType<typeof createApp>;
