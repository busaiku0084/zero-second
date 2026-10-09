import { createHash, randomBytes } from "node:crypto";
import type { User } from "@zero-second/shared";
import type { Db } from "./db.js";
import { type Row, toUser } from "./rows.js";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 推測できないトークン（256 bit） */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** DB にはトークンのハッシュだけを保存する。DB が漏れてもそのままログインには使えない */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db: Db, userId: number, now = Date.now()) {
  db.prepare("DELETE FROM sessions WHERE expires_at_ms <= ?").run(now);
  const token = newToken();
  const expiresAtMs = now + SESSION_TTL_MS;
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)",
  ).run(hashToken(token), userId, now, expiresAtMs);
  return { token, expiresAtMs };
}

/** 有効なセッションのユーザー。無い・期限切れなら null */
export function findSessionUser(db: Db, token: string, now = Date.now()): User | null {
  const row = db
    .prepare(
      `SELECT users.*
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at_ms > ?
         AND users.disabled_at_ms IS NULL`,
    )
    .get(hashToken(token), now);
  return row ? toUser(row as Row) : null;
}

export function deleteSession(db: Db, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}
