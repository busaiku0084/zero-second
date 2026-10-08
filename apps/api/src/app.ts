import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

// TODO(#6): 予約・アカウント・実行結果のルートを追加する
