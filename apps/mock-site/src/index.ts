import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createMockSite } from "./app.js";

// リポジトリ直下の .env を読む（無ければ環境変数のみ）
try {
  process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
} catch {
  // .env が無い場合はそのまま進める
}

const app = createMockSite({
  latencyMs: Number(process.env.MOCK_SITE_LATENCY_MS || 30),
  clockSkewMs: Number(process.env.MOCK_SITE_CLOCK_SKEW_MS || 0),
});

const port = Number(process.env.MOCK_SITE_PORT || 8788);

// 検証用のため、localhost でのみ待ち受ける
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.info(`mock site listening on http://127.0.0.1:${info.port}`);
});
