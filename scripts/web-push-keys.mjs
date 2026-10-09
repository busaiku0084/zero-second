// ブラウザ通知（Web Push）の VAPID の鍵を作り、.env に書く（ADR 0017）
// 使い方: node scripts/web-push-keys.mjs .env
// すでに WEB_PUSH_PUBLIC_KEY が入っていれば何もしない（鍵を変えると、登録済みの端末に届かなくなるため）

import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2] ?? ".env";
const text = existsSync(file) ? readFileSync(file, "utf8") : "";
if (/^WEB_PUSH_PUBLIC_KEY=\S+/m.test(text)) {
  console.log(`${file} にはブラウザ通知の鍵がすでにあります`);
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
// 公開鍵は非圧縮の点（0x04 | x | y）を base64url にしたもの
const point = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(pub.x, "base64url"),
  Buffer.from(pub.y, "base64url"),
]);
const values = {
  WEB_PUSH_PUBLIC_KEY: point.toString("base64url"),
  WEB_PUSH_PRIVATE_KEY: priv.d,
};

let next = text;
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  next = new RegExp(`^${key}=.*$`, "m").test(next)
    ? next.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${next.replace(/\n?$/, "\n")}${line}\n`;
}
writeFileSync(file, next);
console.log(`${file} にブラウザ通知の鍵を書きました`);
