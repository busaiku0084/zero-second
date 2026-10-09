import { zValidator } from "@hono/zod-validator";
import { type InvitationCreated, invitationCreateSchema } from "@zero-second/shared";
import { Hono } from "hono";
import { type Row, toInvitation, toUser } from "../lib/rows.js";
import { hashToken, newToken } from "../lib/session.js";
import type { AppEnv } from "../types.js";
import { requireAdmin } from "./auth.js";
import { idParam, validationHook } from "./params.js";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVITATION_COLUMNS = `invitations.*, users.login_id AS accepted_by_login_id`;

// 管理者向け。ユーザーの一覧と招待だけを扱い、ほかの人の予約などの中身は見ない（ADR 0016）
export const users = new Hono<AppEnv>().use(requireAdmin).get("/", (c) => {
  const rows = c.var.db.prepare("SELECT * FROM users ORDER BY created_at_ms").all();
  return c.json(rows.map((r) => toUser(r as Row)));
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
