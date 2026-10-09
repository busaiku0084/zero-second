import { zValidator } from "@hono/zod-validator";
import {
  type InvitationCreated,
  invitationCreateSchema,
  type PasswordResetCreated,
  userUpdateSchema,
} from "@zero-second/shared";
import { Hono } from "hono";
import { createPasswordReset } from "../lib/password-reset.js";
import { type Row, toInvitation, toUser } from "../lib/rows.js";
import { hashToken, newToken } from "../lib/session.js";
import type { AppEnv } from "../types.js";
import { requireAdmin } from "./auth.js";
import { idParam, validationHook } from "./params.js";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVITATION_COLUMNS = `invitations.*, users.login_id AS accepted_by_login_id`;

// 管理者向け。ユーザーの一覧と招待だけを扱い、ほかの人の予約などの中身は見ない（ADR 0016）
export const users = new Hono<AppEnv>()
  .use(requireAdmin)
  .get("/", (c) => {
    const rows = c.var.db.prepare("SELECT * FROM users ORDER BY created_at_ms").all();
    return c.json(rows.map((r) => toUser(r as Row)));
  })
  // 停止・再開と権限の変更。自分自身は変えられない（管理者がいなくならないように。ADR 0020）
  .patch(
    "/:id",
    zValidator("param", idParam, validationHook),
    zValidator("json", userUpdateSchema, validationHook),
    (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      if (id === c.var.user.id) return c.json({ error: "自分自身は変更できません" }, 409);
      const db = c.var.db;
      if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) {
        return c.json({ error: "ユーザーが見つかりません" }, 404);
      }
      const now = Date.now();
      db.exec("BEGIN");
      try {
        if (body.role !== undefined) {
          db.prepare("UPDATE users SET role = ?, updated_at_ms = ? WHERE id = ?").run(
            body.role,
            now,
            id,
          );
        }
        if (body.disabled !== undefined) {
          db.prepare("UPDATE users SET disabled_at_ms = ?, updated_at_ms = ? WHERE id = ?").run(
            body.disabled ? now : null,
            now,
            id,
          );
          // 停止したら、ログイン中のセッションと再設定リンクも無効にする
          if (body.disabled) {
            db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
            db.prepare("DELETE FROM password_resets WHERE user_id = ? AND used_at_ms IS NULL").run(
              id,
            );
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return c.json(toUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row));
    },
  )
  // パスワードの再設定リンクを発行する。トークンはこのときだけ返す
  .post("/:id/password-reset", zValidator("param", idParam, validationHook), (c) => {
    const { id } = c.req.valid("param");
    const user = c.var.db.prepare("SELECT disabled_at_ms FROM users WHERE id = ?").get(id) as
      | Row
      | undefined;
    if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
    if (user.disabled_at_ms !== null) {
      return c.json({ error: "停止中のユーザーには発行できません。先に再開してください" }, 409);
    }
    const created: PasswordResetCreated = createPasswordReset(c.var.db, id, c.var.user.id);
    return c.json(created, 201);
  });

export const invitations = new Hono<AppEnv>()
  .use(requireAdmin)
  .get("/", (c) => {
    const rows = c.var.db
      .prepare(
        `SELECT ${INVITATION_COLUMNS} FROM invitations
         LEFT JOIN users ON users.id = invitations.accepted_by
         ORDER BY invitations.created_at_ms DESC`,
      )
      .all();
    return c.json(rows.map((r) => toInvitation(r as Row)));
  })
  .post("/", zValidator("json", invitationCreateSchema, validationHook), (c) => {
    const { note } = c.req.valid("json");
    const token = newToken();
    const now = Date.now();
    const row = c.var.db
      .prepare(
        `INSERT INTO invitations (token_hash, note, created_by, created_at_ms, expires_at_ms)
         VALUES (?, ?, ?, ?, ?) RETURNING *, NULL AS accepted_by_login_id`,
      )
      .get(hashToken(token), note, c.var.user.id, now, now + INVITATION_TTL_MS);
    const created: InvitationCreated = { ...toInvitation(row as Row), token };
    return c.json(created, 201);
  })
  // 未使用の招待を取り消す
  .delete("/:id", zValidator("param", idParam, validationHook), (c) => {
    const { id } = c.req.valid("param");
    const res = c.var.db
      .prepare("DELETE FROM invitations WHERE id = ? AND accepted_at_ms IS NULL")
      .run(id);
    if (res.changes === 0) return c.json({ error: "取り消せる招待が見つかりません" }, 404);
    return c.body(null, 204);
  });
