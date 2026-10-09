import type { Db } from "./db.js";
import { hashToken, newToken } from "./session.js";

export const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * パスワードの再設定リンクのトークンを作る（ADR 0020）。
 * 同じユーザーの未使用のリンクは無効にし、最新の 1 本だけを使えるようにする
 */
export function createPasswordReset(db: Db, userId: number, createdBy: number | null) {
  const now = Date.now();
  const token = newToken();
  const expiresAtMs = now + PASSWORD_RESET_TTL_MS;
  db.prepare("DELETE FROM password_resets WHERE user_id = ? AND used_at_ms IS NULL").run(userId);
  db.prepare(
    `INSERT INTO password_resets (user_id, token_hash, created_by, created_at_ms, expires_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, hashToken(token), createdBy, now, expiresAtMs);
  return { token, expiresAtMs };
}

/** 有効（未使用・期限内）な再設定リンクの id と、対象のユーザー */
export function findOpenPasswordReset(db: Db, token: string) {
  const row = db
    .prepare(
      `SELECT password_resets.id, users.id AS user_id, users.login_id
       FROM password_resets JOIN users ON users.id = password_resets.user_id
       WHERE password_resets.token_hash = ? AND password_resets.used_at_ms IS NULL
         AND password_resets.expires_at_ms > ? AND users.disabled_at_ms IS NULL`,
    )
    .get(hashToken(token), Date.now());
  return row
    ? { id: Number(row.id), userId: Number(row.user_id), loginId: String(row.login_id) }
    : null;
}
