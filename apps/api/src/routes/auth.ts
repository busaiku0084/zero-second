import { zValidator } from "@hono/zod-validator";
import {
  loginSchema,
  passwordChangeSchema,
  type SessionResponse,
  signupSchema,
  type User,
} from "@zero-second/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Db } from "../lib/db.js";
import { dummyPasswordHash, hashPassword, verifyPassword } from "../lib/password.js";
import { type Row, toUser } from "../lib/rows.js";
import { createSession, deleteSession, findSessionUser, hashToken } from "../lib/session.js";
import type { AppEnv } from "../types.js";
import { validationHook } from "./params.js";

export const SESSION_HEADER = "x-session-token";

/** ログインなしで呼べるルート。ここに無いルートはすべてログイン必須 */
const PUBLIC_PATHS = [
  /^\/health$/,
  /^\/auth\/login$/,
  /^\/auth\/setup$/,
  /^\/auth\/invitations\/[^/]+$/,
];

/** x-session-token のセッションを確かめ、c.var.user に入れる。無ければ 401 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  if (PUBLIC_PATHS.some((p) => p.test(c.req.path))) return next();
  const token = c.req.header(SESSION_HEADER);
  const user = token ? findSessionUser(c.var.db, token) : null;
  if (!token || !user) return c.json({ error: "ログインしてください" }, 401);
  c.set("user", user);
  c.set("sessionToken", token);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.user.role !== "admin") return c.json({ error: "管理者だけが使えます" }, 403);
  await next();
});

function userCount(db: Db): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row).n);
}

function loginIdTaken(db: Db, loginId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM users WHERE login_id = ?").get(loginId));
}

function insertUser(db: Db, loginId: string, passwordHash: string, role: User["role"]): User {
  const now = Date.now();
  const row = db
    .prepare(
      `INSERT INTO users (login_id, password_hash, role, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(loginId, passwordHash, role, now, now);
  return toUser(row as Row);
}

function sessionResponse(db: Db, user: User): SessionResponse {
  return { ...createSession(db, user.id), user };
}

/** トランザクションの中で fn を実行する（node:sqlite は同期なので、途中で他のリクエストは割り込まない） */
function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const tokenParam = z.object({ token: z.string().min(1).max(100) });

/** 有効（未使用・期限内）な招待の id */
function findOpenInvitation(db: Db, token: string): number | null {
  const row = db
    .prepare(
      `SELECT id FROM invitations
       WHERE token_hash = ? AND accepted_at_ms IS NULL AND expires_at_ms > ?`,
    )
    .get(hashToken(token), Date.now());
  return row ? Number(row.id) : null;
}

export const auth = new Hono<AppEnv>()
  .post("/login", zValidator("json", loginSchema, validationHook), async (c) => {
    const { loginId, password } = c.req.valid("json");
    const limiter = c.var.loginLimiter;
    const blockedMs = limiter.blockedForMs(loginId);
    if (blockedMs > 0) {
      const minutes = Math.ceil(blockedMs / 60_000);
      return c.json({ error: `ログインの失敗が続いたため、${minutes} 分ほど受け付けません` }, 429);
    }

    const row = c.var.db.prepare("SELECT * FROM users WHERE login_id = ?").get(loginId) as
      | Row
      | undefined;
    // ユーザーがいなくても照合はする（応答時間で ID の有無を推測されないように）
    const ok = await verifyPassword(
      password,
      row ? String(row.password_hash) : await dummyPasswordHash(),
    );
    if (!row || !ok) {
      limiter.fail(loginId);
      return c.json({ error: "ログイン ID またはパスワードが違います" }, 401);
    }
    limiter.succeed(loginId);
    return c.json(sessionResponse(c.var.db, toUser(row)));
  })
  .get("/setup", (c) => c.json({ required: userCount(c.var.db) === 0 }))
  // 最初のユーザー（管理者）を作る。ユーザーが 1 人でもいれば使えない
  .post("/setup", zValidator("json", signupSchema, validationHook), async (c) => {
    const { loginId, password } = c.req.valid("json");
    const passwordHash = await hashPassword(password);
    const db = c.var.db;
    const created = transaction(db, () => {
      if (userCount(db) > 0) return null;
      const user = insertUser(db, loginId, passwordHash, "admin");
      // ログイン機能より前に登録したデータは、最初の管理者に引き継ぐ
      db.prepare("UPDATE accounts SET user_id = ? WHERE user_id IS NULL").run(user.id);
      db.prepare("UPDATE reservations SET user_id = ? WHERE user_id IS NULL").run(user.id);
      return sessionResponse(db, user);
    });
    if (!created) return c.json({ error: "セットアップは完了しています" }, 409);
    return c.json(created, 201);
  })
  .get("/invitations/:token", zValidator("param", tokenParam, validationHook), (c) => {
    const { token } = c.req.valid("param");
    return c.json({ valid: findOpenInvitation(c.var.db, token) !== null });
  })
  // 招待を受けてユーザーを作る
  .post(
    "/invitations/:token",
    zValidator("param", tokenParam, validationHook),
    zValidator("json", signupSchema, validationHook),
    async (c) => {
      const { token } = c.req.valid("param");
      const { loginId, password } = c.req.valid("json");
      const passwordHash = await hashPassword(password);
      const db = c.var.db;
      const result = transaction(db, () => {
        const invitationId = findOpenInvitation(db, token);
        if (invitationId === null) return { error: "invalid" as const };
        if (loginIdTaken(db, loginId)) return { error: "taken" as const };
        const user = insertUser(db, loginId, passwordHash, "member");
        db.prepare("UPDATE invitations SET accepted_by = ?, accepted_at_ms = ? WHERE id = ?").run(
          user.id,
          Date.now(),
          invitationId,
        );
        return { session: sessionResponse(db, user) };
      });
      if (result.error === "invalid") {
        return c.json({ error: "招待リンクが無効か、期限が切れています" }, 404);
      }
      if (result.error === "taken") {
        return c.json(
          {
            error: "入力内容に誤りがあります",
            issues: [{ path: "loginId", message: "このログイン ID は使われています" }],
          },
          409,
        );
      }
      return c.json(result.session, 201);
    },
  )
  .get("/me", (c) => c.json(c.var.user))
  .post("/logout", (c) => {
    deleteSession(c.var.db, c.var.sessionToken);
    return c.body(null, 204);
  })
  .put("/password", zValidator("json", passwordChangeSchema, validationHook), async (c) => {
    const { currentPassword, newPassword } = c.req.valid("json");
    const db = c.var.db;
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(c.var.user.id) as
      | Row
      | undefined;
    if (!row || !(await verifyPassword(currentPassword, String(row.password_hash)))) {
      return c.json(
        {
          error: "入力内容に誤りがあります",
          issues: [{ path: "currentPassword", message: "現在のパスワードが違います" }],
        },
        400,
      );
    }
    const passwordHash = await hashPassword(newPassword);
    transaction(db, () => {
      db.prepare("UPDATE users SET password_hash = ?, updated_at_ms = ? WHERE id = ?").run(
        passwordHash,
        Date.now(),
        c.var.user.id,
      );
      // ほかの端末のセッションは無効にする（今の端末はそのまま）
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(
        c.var.user.id,
        hashToken(c.var.sessionToken),
      );
    });
    return c.body(null, 204);
  });
