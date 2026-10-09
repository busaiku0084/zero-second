import { SITES } from "@zero-second/shared";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";
import type { Db } from "./lib/db.js";
import { LoginLimiter } from "./lib/rate-limit.js";
import { accounts } from "./routes/accounts.js";
import { auth, requireSession } from "./routes/auth.js";
import { dashboard } from "./routes/dashboard.js";
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
};

export function createApp({
  db,
  encryptionKey,
  apiToken,
  loginLimiter = new LoginLimiter(),
}: AppOptions) {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  if (apiToken) app.use("/*", bearerAuth({ token: apiToken }));

  app.use("/*", async (c, next) => {
    c.set("db", db);
    c.set("encryptionKey", encryptionKey);
    c.set("loginLimiter", loginLimiter);
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
    .route("/dashboard", dashboard);
}

export type App = ReturnType<typeof createApp>;
