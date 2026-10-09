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

const port = Number(process.env.MOCK_SITE_PORT || 47302);
// 既定は localhost のみ。Docker の中では 0.0.0.0 にする（ホスト側は 127.0.0.1 にだけ公開する。ADR 0015）
const hostname = process.env.MOCK_SITE_HOST || "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.info(`mock site listening on http://${hostname}:${info.port}`);
});
