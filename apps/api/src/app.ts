import { SITES } from "@zero-second/shared";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";
import type { Db } from "./lib/db.js";
import { accounts } from "./routes/accounts.js";
import { dashboard } from "./routes/dashboard.js";
import { reservations } from "./routes/reservations.js";
import { runs } from "./routes/runs.js";
import type { AppEnv } from "./types.js";

export type AppOptions = {
  db: Db;
  encryptionKey: Buffer;
  /** 設定時は Authorization: Bearer <token> を必須にする */
  apiToken?: string;
};

export function createApp({ db, encryptionKey, apiToken }: AppOptions) {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  if (apiToken) app.use("/*", bearerAuth({ token: apiToken }));

  app.use("/*", async (c, next) => {
    c.set("db", db);
    c.set("encryptionKey", encryptionKey);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "サーバーでエラーが発生しました" }, 500);
  });

  return app
    .get("/sites", (c) => c.json(SITES))
    .route("/accounts", accounts)
    .route("/reservations", reservations)
    .route("/runs", runs)
    .route("/dashboard", dashboard);
}

export type App = ReturnType<typeof createApp>;
