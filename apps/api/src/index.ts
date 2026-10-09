import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { parseKey } from "./lib/crypto.js";
import { migrate, openDb } from "./lib/db.js";

const ROOT = resolve(import.meta.dirname, "../../..");

// リポジトリ直下の .env を読む（無ければ環境変数のみ）
try {
  process.loadEnvFile(resolve(ROOT, ".env"));
} catch {
  // .env が無い場合はそのまま進める
}

/** DATABASE_URL（file:./data/xxx.sqlite）をリポジトリ直下からの絶対パスにする */
function databasePath(url = "file:./data/zero-second.sqlite"): string {
  return resolve(ROOT, url.replace(/^file:/, ""));
}

const dbPath = databasePath(process.env.DATABASE_URL);
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const applied = migrate(db);
if (applied.length > 0) console.info(`migrations applied: ${applied.join(", ")}`);

const app = createApp({
  db,
  encryptionKey: parseKey(process.env.CREDENTIALS_ENCRYPTION_KEY),
  apiToken: process.env.API_TOKEN || undefined,
});

const port = Number(process.env.API_PORT || 47301);
// 既定は localhost のみ。Docker の中では 0.0.0.0 にする（ホストへは公開しない。ADR 0015）
const hostname = process.env.API_HOST || "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.info(`api listening on http://${hostname}:${info.port}`);
});
