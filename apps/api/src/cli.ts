// サーバーで使う管理用のコマンド（ADR 0020）
//
//   tsx src/cli.ts reset-link <ログイン ID>
//     パスワードの再設定リンクを出す。管理者が 1 人しかいなくてパスワードを忘れたとき用
//     Docker では: docker compose exec api node_modules/.bin/tsx src/cli.ts reset-link <ログイン ID>

import { resolve } from "node:path";
import { openDb } from "./lib/db.js";
import { createPasswordReset } from "./lib/password-reset.js";

const ROOT = resolve(import.meta.dirname, "../../..");
try {
  process.loadEnvFile(resolve(ROOT, ".env"));
} catch {
  // .env が無ければ環境変数のみ
}

const [command, loginId] = process.argv.slice(2);
if (command !== "reset-link" || !loginId) {
  console.error("使い方: tsx src/cli.ts reset-link <ログイン ID>");
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? "file:./data/zero-second.sqlite";
const db = openDb(resolve(ROOT, url.replace(/^file:/, "")));
const user = db.prepare("SELECT id FROM users WHERE login_id = ?").get(loginId);
if (!user) {
  console.error(`ユーザー ${loginId} が見つかりません`);
  process.exit(1);
}
const { token } = createPasswordReset(db, Number(user.id), null);
const appUrl = (process.env.APP_URL || "http://127.0.0.1:47300").replace(/\/$/, "");
console.log(`${appUrl}/reset/${token}`);
console.log("24 時間有効で、1 回だけ使えます");
