import { zValidator } from "@hono/zod-validator";
import { accountCreateSchema, accountUpdateSchema } from "@zero-second/shared";
import { Hono } from "hono";
import { encrypt } from "../lib/crypto.js";
import { type Row, toAccount } from "../lib/rows.js";
import type { AppEnv } from "../types.js";
import { idParam, validationHook } from "./params.js";

const COLUMNS = "id, site, login_id, created_at_ms, updated_at_ms";

export const accounts = new Hono<AppEnv>()
  .get("/", (c) => {
    const rows = c.var.db.prepare(`SELECT ${COLUMNS} FROM accounts ORDER BY site, login_id`).all();
    return c.json(rows.map((r) => toAccount(r as Row)));
  })
  .post("/", zValidator("json", accountCreateSchema, validationHook), (c) => {
    const body = c.req.valid("json");
    const now = Date.now();
    const exists = c.var.db
      .prepare("SELECT 1 FROM accounts WHERE site = ? AND login_id = ?")
      .get(body.site, body.loginId);
    if (exists) return c.json({ error: "同じサイト・ログインIDのアカウントが既にあります" }, 409);

    const row = c.var.db
      .prepare(
        `INSERT INTO accounts (site, login_id, encrypted_credentials, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
      )
      .get(body.site, body.loginId, encrypt(c.var.encryptionKey, body.password), now, now);
    return c.json(toAccount(row as Row), 201);
  })
  .patch(
    "/:id",
    zValidator("param", idParam, validationHook),
    zValidator("json", accountUpdateSchema, validationHook),
    (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const sets: string[] = [];
      const values: (string | number | Buffer)[] = [];
      if (body.loginId !== undefined) {
        sets.push("login_id = ?");
        values.push(body.loginId);
      }
      if (body.password !== undefined) {
        sets.push("encrypted_credentials = ?");
        values.push(encrypt(c.var.encryptionKey, body.password));
      }
      sets.push("updated_at_ms = ?");
      values.push(Date.now());

      const row = c.var.db
        .prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ? RETURNING ${COLUMNS}`)
        .get(...values, id);
      if (!row) return c.json({ error: "アカウントが見つかりません" }, 404);
      return c.json(toAccount(row as Row));
    },
  )
  .delete("/:id", zValidator("param", idParam, validationHook), (c) => {
    const { id } = c.req.valid("param");
    const res = c.var.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    if (res.changes === 0) return c.json({ error: "アカウントが見つかりません" }, 404);
    return c.body(null, 204);
  });
