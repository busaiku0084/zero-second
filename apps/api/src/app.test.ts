import { randomBytes } from "node:crypto";
import type {
  Account,
  ChecklistItem,
  DashboardSummary,
  InvitationCreated,
  PasswordResetCreated,
  Reservation,
  ReservationListItem,
  Run,
  SessionResponse,
  User,
} from "@zero-second/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { decrypt } from "./lib/crypto.js";
import { type Db, migrate, openDb } from "./lib/db.js";

const key = randomBytes(32);
let db: Db;
let app: ReturnType<typeof createApp>;
/** json() が付けるセッション（beforeEach で管理者としてログインしたもの） */
let session: string | null = null;

const SALE_AT = Date.UTC(2026, 9, 10, 3, 0, 0);

/** token に null を渡すとセッションなしで呼ぶ */
function json(method: string, path: string, body?: unknown, token: string | null = session) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  return app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const get = (path: string, token: string | null = session) => json("GET", path, undefined, token);

const ADMIN = { loginId: "admin", password: "correct-horse-1" };

async function setupAdmin(): Promise<SessionResponse> {
  const res = await json("POST", "/auth/setup", ADMIN, null);
  expect(res.status).toBe(201);
  return (await res.json()) as SessionResponse;
}

/** 管理者が招待し、招待されたユーザーとして登録する */
async function inviteMember(loginId: string): Promise<SessionResponse> {
  const invite = (await (await json("POST", "/invitations", {})).json()) as InvitationCreated;
  const res = await json(
    "POST",
    `/auth/invitations/${invite.token}`,
    { loginId, password: "member-pass-1" },
    null,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as SessionResponse;
}

const reservationInput = {
  site: "ticketdive",
  title: "テスト公演",
  eventUrl: "https://ticketdive.com/event/example",
  ticketType: "一般",
  quantity: 1,
  saleStartsAtMs: SALE_AT,
};

async function createReservation(overrides: Record<string, unknown> = {}) {
  const res = await json("POST", "/reservations", { ...reservationInput, ...overrides });
  expect(res.status).toBe(201);
  return (await res.json()) as Reservation;
}

beforeEach(async () => {
  db = openDb(":memory:");
  migrate(db);
  app = createApp({ db, encryptionKey: key });
  session = null;
  session = (await setupAdmin()).token;
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("認証", () => {
  it("API_TOKEN 設定時はトークンなしを拒否し、/health は通す", async () => {
    app = createApp({ db, encryptionKey: key, apiToken: "secret" });
    expect((await get("/sites")).status).toBe(401);
    expect((await app.request("/health")).status).toBe(200);
    const ok = await app.request("/sites", {
      headers: { authorization: "Bearer secret", "x-session-token": session ?? "" },
    });
    expect(ok.status).toBe(200);
  });
});

describe("ログイン", () => {
  it("セッションが無ければ 401、公開のルートは通す", async () => {
    expect((await get("/reservations", null)).status).toBe(401);
    expect((await get("/reservations", "wrong")).status).toBe(401);
    expect((await get("/auth/setup", null)).status).toBe(200);
  });

  it("初回セットアップは 1 回だけ。最初のユーザーは管理者", async () => {
    const me = (await (await get("/auth/me")).json()) as User;
    expect(me).toMatchObject({ loginId: "admin", role: "admin" });
    expect(await (await get("/auth/setup", null)).json()).toEqual({ required: false });
    const again = await json("POST", "/auth/setup", { ...ADMIN, loginId: "other" }, null);
    expect(again.status).toBe(409);
  });

  it("パスワードはハッシュで保存し、セッションはトークンのハッシュだけを保存する", async () => {
    const row = db.prepare("SELECT password_hash FROM users").get() as { password_hash: string };
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(ADMIN.password);
    const tokens = db.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    expect(tokens.map((t) => t.token_hash)).not.toContain(session);
  });

  it("ログインとログアウト", async () => {
    const res = await json("POST", "/auth/login", ADMIN, null);
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as SessionResponse;
    expect((await get("/auth/me", token)).status).toBe(200);
    expect((await json("POST", "/auth/logout", undefined, token)).status).toBe(204);
    expect((await get("/auth/me", token)).status).toBe(401);
  });

  it("ID・パスワードが違えば同じメッセージで 401。続けて失敗すると 429", async () => {
    const wrong = await json("POST", "/auth/login", { ...ADMIN, password: "x" }, null);
    const missing = await json("POST", "/auth/login", { ...ADMIN, loginId: "nobody" }, null);
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await wrong.json()).toEqual(await missing.json());

    for (let i = 0; i < 4; i++) {
      await json("POST", "/auth/login", { ...ADMIN, password: "x" }, null);
    }
    // 制限中は正しいパスワードでも受け付けない
    expect((await json("POST", "/auth/login", ADMIN, null)).status).toBe(429);
  });

  it("期限切れのセッションは使えない", async () => {
    db.prepare("UPDATE sessions SET expires_at_ms = 0").run();
    expect((await get("/auth/me")).status).toBe(401);
  });

  it("パスワードを変えると、ほかのセッションは無効になる", async () => {
    const other = (await (
      await json("POST", "/auth/login", ADMIN, null)
    ).json()) as SessionResponse;
    const bad = await json("PUT", "/auth/password", {
      currentPassword: "x",
      newPassword: "new-password-1",
    });
    expect(bad.status).toBe(400);
    const res = await json("PUT", "/auth/password", {
      currentPassword: ADMIN.password,
      newPassword: "new-password-1",
    });
    expect(res.status).toBe(204);
    expect((await get("/auth/me")).status).toBe(200);
    expect((await get("/auth/me", other.token)).status).toBe(401);
    const login = await json(
      "POST",
      "/auth/login",
      { loginId: "admin", password: "new-password-1" },
      null,
    );
    expect(login.status).toBe(200);
  });
});

describe("招待", () => {
  it("招待リンクから登録でき、リンクは 1 回だけ使える", async () => {
    const invite = (await (
      await json("POST", "/invitations", { note: "友人 A" })
    ).json()) as InvitationCreated;
    expect(await (await get(`/auth/invitations/${invite.token}`, null)).json()).toEqual({
      valid: true,
    });

    const input = { loginId: "friend", password: "member-pass-1" };
    const res = await json("POST", `/auth/invitations/${invite.token}`, input, null);
    expect(res.status).toBe(201);
    const created = (await res.json()) as SessionResponse;
    expect(created.user).toMatchObject({ loginId: "friend", role: "member" });

    const reuse = await json(
      "POST",
      `/auth/invitations/${invite.token}`,
      { ...input, loginId: "friend2" },
      null,
    );
    expect(reuse.status).toBe(404);

    const list = (await (await get("/invitations")).json()) as InvitationCreated[];
    expect(list[0]).toMatchObject({ note: "友人 A", acceptedByLoginId: "friend" });
    expect(list[0]).not.toHaveProperty("token");
  });

  it("期限切れ・取り消し済みの招待は使えない。使われている ID は 409", async () => {
    const a = (await (await json("POST", "/invitations", {})).json()) as InvitationCreated;
    db.prepare("UPDATE invitations SET expires_at_ms = 0 WHERE id = ?").run(a.id);
    const input = { loginId: "friend", password: "member-pass-1" };
    expect((await json("POST", `/auth/invitations/${a.token}`, input, null)).status).toBe(404);

    const b = (await (await json("POST", "/invitations", {})).json()) as InvitationCreated;
    expect((await json("DELETE", `/invitations/${b.id}`)).status).toBe(204);
    expect((await json("POST", `/auth/invitations/${b.token}`, input, null)).status).toBe(404);

    const c = (await (await json("POST", "/invitations", {})).json()) as InvitationCreated;
    const taken = await json(
      "POST",
      `/auth/invitations/${c.token}`,
      { ...input, loginId: "ADMIN" },
      null,
    );
    expect(taken.status).toBe(409);
  });

  it("招待とユーザー一覧は管理者だけ", async () => {
    const member = await inviteMember("friend");
    expect((await json("POST", "/invitations", {}, member.token)).status).toBe(403);
    expect((await get("/invitations", member.token)).status).toBe(403);
    expect((await get("/users", member.token)).status).toBe(403);
    const users = (await (await get("/users")).json()) as User[];
    expect(users.map((u) => u.loginId)).toEqual(["admin", "friend"]);
  });
});

describe("ユーザーごとのデータの分離", () => {
  it("ほかのユーザーの予約・アカウント・結果は見えず、操作もできない", async () => {
    const mine = await createReservation();
    const account = (await (
      await json("POST", "/accounts", { site: "ticketdive", loginId: "me", password: "x" })
    ).json()) as Account;
    const run = (await (
      await json("POST", `/reservations/${mine.id}/manual-runs`, {
        result: "succeeded",
        finishedAtMs: SALE_AT + 1000,
      })
    ).json()) as Run;

    const other = (await inviteMember("friend")).token;
    expect(await (await get("/reservations", other)).json()).toEqual([]);
    expect(await (await get("/accounts", other)).json()).toEqual([]);
    expect((await get(`/reservations/${mine.id}`, other)).status).toBe(404);
    expect((await get(`/runs/${run.id}`, other)).status).toBe(404);
    expect((await json("PATCH", `/reservations/${mine.id}`, { quantity: 2 }, other)).status).toBe(
      404,
    );
    expect((await json("DELETE", `/reservations/${mine.id}`, undefined, other)).status).toBe(404);
    expect((await json("DELETE", `/accounts/${account.id}`, undefined, other)).status).toBe(404);

    // ほかの人のアカウントは予約に紐づけられない
    const res = await json(
      "POST",
      "/reservations",
      { ...reservationInput, accountId: account.id },
      other,
    );
    expect(res.status).toBe(400);

    const summary = (await (await get("/dashboard?range=all", other)).json()) as DashboardSummary;
    expect(summary.runCount).toBe(0);

    // 同じサイト・ログイン ID のアカウントは、ユーザーが違えば登録できる
    const same = await json(
      "POST",
      "/accounts",
      { site: "ticketdive", loginId: "me", password: "y" },
      other,
    );
    expect(same.status).toBe(201);
  });

  it("ログイン機能より前のデータは、最初の管理者に引き継ぐ", async () => {
    db = openDb(":memory:");
    migrate(db);
    app = createApp({ db, encryptionKey: key });
    db.prepare(
      `INSERT INTO reservations (site, title, event_url, ticket_type, quantity, payment_method,
         sale_starts_at_ms, created_at_ms, updated_at_ms)
       VALUES ('mock', '前からある予約', 'http://127.0.0.1:47302/events/ok', '一般', 1,
         'convenience_store', 1, 0, 0)`,
    ).run();
    session = (await setupAdmin()).token;
    const list = (await (await get("/reservations")).json()) as Reservation[];
    expect(list.map((r) => r.title)).toEqual(["前からある予約"]);
  });
});

describe("/accounts", () => {
  it("パスワードは暗号化して保存し、レスポンスには含めない", async () => {
    const res = await json("POST", "/accounts", {
      site: "ticketdive",
      loginId: "me@example.com",
      password: "p@ss",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Account & Record<string, unknown>;
    expect(body.loginId).toBe("me@example.com");
    expect(JSON.stringify(body)).not.toContain("p@ss");

    const row = db
      .prepare("SELECT encrypted_credentials FROM accounts WHERE id = ?")
      .get(body.id) as { encrypted_credentials: Uint8Array };
    expect(Buffer.from(row.encrypted_credentials).toString("utf8")).not.toContain("p@ss");
    expect(decrypt(key, row.encrypted_credentials)).toBe("p@ss");
  });

  it("同じサイト・ログインIDは 409", async () => {
    const input = { site: "ticketdive", loginId: "me@example.com", password: "x" };
    await json("POST", "/accounts", input);
    expect((await json("POST", "/accounts", input)).status).toBe(409);
  });

  it("更新と削除", async () => {
    const created = (await (
      await json("POST", "/accounts", { site: "livepocket", loginId: "a", password: "x" })
    ).json()) as Account;
    const updated = await json("PATCH", `/accounts/${created.id}`, { loginId: "b" });
    expect(((await updated.json()) as Account).loginId).toBe("b");
    expect((await json("DELETE", `/accounts/${created.id}`)).status).toBe(204);
    expect((await json("DELETE", `/accounts/${created.id}`)).status).toBe(404);
  });
});

describe("/reservations", () => {
  it("手動の予約を作成・取得できる", async () => {
    const created = await createReservation();
    expect(created).toMatchObject({ mode: "manual", status: "pending", accountId: null });
    const res = await get(`/reservations/${created.id}`);
    expect(((await res.json()) as Reservation & { runs: Run[] }).runs).toEqual([]);
  });

  it("規約で自動化が禁止されたサイトでは auto を選べない", async () => {
    const res = await json("POST", "/reservations", { ...reservationInput, mode: "auto" });
    expect(res.status).toBe(400);

    const created = await createReservation();
    const patch = await json("PATCH", `/reservations/${created.id}`, { mode: "auto" });
    expect(patch.status).toBe(400);
  });

  it("モックサイトでは auto を選べる", async () => {
    const created = await createReservation({
      site: "mock",
      eventUrl: "http://127.0.0.1:47302/events/ok",
      mode: "auto",
    });
    expect(created.mode).toBe("auto");
  });

  it("公演 URL を別サイトのものに変更できない", async () => {
    const created = await createReservation({});
    const res = await json("PATCH", `/reservations/${created.id}`, {
      eventUrl: "https://livepocket.jp/e/abc",
    });
    expect(res.status).toBe(400);
  });

  it("別サイトのアカウントは紐づけられない", async () => {
    const account = (await (
      await json("POST", "/accounts", { site: "livepocket", loginId: "a", password: "x" })
    ).json()) as Account;
    const res = await json("POST", "/reservations", { ...reservationInput, accountId: account.id });
    expect(res.status).toBe(400);
  });

  it("不正な入力は項目ごとのエラーを返す", async () => {
    const res = await json("POST", "/reservations", { ...reservationInput, quantity: 0 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: { path: string }[] };
    expect(body.issues.map((i) => i.path)).toContain("quantity");
  });

  it("実行中の予約は変更できない", async () => {
    const created = await createReservation();
    db.prepare("UPDATE reservations SET status = 'running' WHERE id = ?").run(created.id);
    expect((await json("PATCH", `/reservations/${created.id}`, { quantity: 2 })).status).toBe(409);
    expect((await json("DELETE", `/reservations/${created.id}`)).status).toBe(409);
  });
});

describe("手動購入の記録とダッシュボード", () => {
  it("記録すると予約の状態が変わり、所要時間が集計される", async () => {
    const a = await createReservation();
    const b = await createReservation({ title: "別公演" });

    const runRes = await json("POST", `/reservations/${a.id}/manual-runs`, {
      result: "succeeded",
      finishedAtMs: SALE_AT + 42_000,
      paymentReference: "1234-5678",
    });
    expect(runRes.status).toBe(201);
    const manualRun = (await runRes.json()) as Run;
    expect(manualRun.elapsedMs).toBe(42_000);
    expect(manualRun.driver).toBeNull();
    await json("POST", `/reservations/${b.id}/manual-runs`, {
      result: "sold_out",
      finishedAtMs: SALE_AT + 90_000,
    });

    const detail = (await (await get(`/reservations/${a.id}`)).json()) as Reservation;
    expect(detail.status).toBe("succeeded");

    const summary = (await (await get("/dashboard?range=all")).json()) as DashboardSummary;
    expect(summary).toMatchObject({
      runCount: 2,
      succeededCount: 1,
      medianElapsedMs: 42_000,
      fastestElapsedMs: 42_000,
    });
    expect(summary.resultCounts.sold_out).toBe(1);
    expect(summary.series).toHaveLength(2);
  });

  it("販売開始より前に失敗した実行は所要時間なしで、グラフに載せない", async () => {
    const a = await createReservation();
    // ワーカーが準備の段階（販売開始の 2 分前）で失敗したときの記録
    db.prepare(
      `INSERT INTO runs (reservation_id, mode, started_at_ms, finished_at_ms, result, error, driver)
       VALUES (?, 'auto', ?, ?, 'failed', 'ログインできません', 'browser')`,
    ).run(a.id, SALE_AT - 120_000, SALE_AT - 115_000);

    const detail = (await (await get(`/reservations/${a.id}`)).json()) as { runs: Run[] };
    expect(detail.runs[0]?.elapsedMs).toBeNull();
    // 自動購入で使った操作の方法（ADR 0022）
    expect(detail.runs[0]?.driver).toBe("browser");

    const summary = (await (await get("/dashboard?range=all")).json()) as DashboardSummary;
    expect(summary.runCount).toBe(1);
    expect(summary.resultCounts.failed).toBe(1);
    expect(summary.series).toHaveLength(0);
  });

  it("完了時刻が開始より前なら 400", async () => {
    const a = await createReservation();
    const res = await json("POST", `/reservations/${a.id}/manual-runs`, {
      result: "succeeded",
      finishedAtMs: SALE_AT - 1,
    });
    expect(res.status).toBe(400);
  });
});

describe("購入前チェックリスト", () => {
  type Detail = Reservation & { checklist: ChecklistItem[] };
  const detail = async (id: number, token: string | null = session) =>
    (await (await get(`/reservations/${id}`, token)).json()) as Detail;

  it("予約を作るとサイトのテンプレートが入り、一覧に進み具合が出る", async () => {
    const r = await createReservation();
    const { checklist } = await detail(r.id);
    expect(checklist.length).toBeGreaterThan(0);
    expect(checklist[0]?.label).toContain("TicketDive");
    expect(checklist.every((i) => !i.done)).toBe(true);

    for (const item of checklist) {
      const res = await json("PATCH", `/reservations/${r.id}/checklist/${item.id}`, { done: true });
      expect(((await res.json()) as ChecklistItem).done).toBe(true);
    }
    const list = (await (await get("/reservations")).json()) as ReservationListItem[];
    expect(list[0]).toMatchObject({
      checklistTotal: checklist.length,
      checklistDone: checklist.length,
    });
  });

  it("項目を足す・消す・テンプレートから戻す", async () => {
    const r = await createReservation();
    const added = await json("POST", `/reservations/${r.id}/checklist`, { label: "同行者に連絡" });
    expect(added.status).toBe(201);
    const item = (await added.json()) as ChecklistItem;
    const before = (await detail(r.id)).checklist;
    expect(before.at(-1)?.label).toBe("同行者に連絡");

    for (const i of before.slice(0, 2)) {
      expect((await json("DELETE", `/reservations/${r.id}/checklist/${i.id}`)).status).toBe(204);
    }
    const restored = await json("POST", `/reservations/${r.id}/checklist/template`);
    const after = (await restored.json()) as ChecklistItem[];
    // 消したテンプレートの 2 件だけが戻り、重複しない
    expect(after).toHaveLength(before.length);
    expect(new Set(after.map((i) => i.label)).size).toBe(after.length);
    expect(after.some((i) => i.id === item.id)).toBe(true);
  });

  it("ほかのユーザーの予約のチェックリストは触れない", async () => {
    const r = await createReservation();
    const [item] = (await detail(r.id)).checklist;
    const invite = (await (await json("POST", "/invitations", {})).json()) as InvitationCreated;
    const other = (
      (await (
        await json(
          "POST",
          `/auth/invitations/${invite.token}`,
          { loginId: "friend", password: "member-pass-1" },
          null,
        )
      ).json()) as SessionResponse
    ).token;
    const path = `/reservations/${r.id}/checklist`;
    expect((await json("POST", path, { label: "x" }, other)).status).toBe(404);
    expect((await json("PATCH", `${path}/${item?.id}`, { done: true }, other)).status).toBe(404);
    expect((await json("DELETE", `${path}/${item?.id}`, undefined, other)).status).toBe(404);
    expect((await json("POST", `${path}/template`, undefined, other)).status).toBe(404);
  });

  it("予約を消すとチェックリストも消える", async () => {
    const r = await createReservation();
    await json("DELETE", `/reservations/${r.id}`);
    const n = db.prepare("SELECT COUNT(*) AS n FROM checklist_items").get() as { n: number };
    expect(Number(n.n)).toBe(0);
  });
});

describe("ユーザー管理", () => {
  async function member(loginId = "friend") {
    const s = await inviteMember(loginId);
    return { token: s.token, id: s.user.id };
  }

  it("再設定リンクで新しいパスワードにでき、ほかのセッションは無効になる", async () => {
    const m = await member();
    const res = await json("POST", `/users/${m.id}/password-reset`);
    expect(res.status).toBe(201);
    const { token } = (await res.json()) as PasswordResetCreated;
    expect(await (await get(`/auth/password-resets/${token}`, null)).json()).toEqual({
      valid: true,
      loginId: "friend",
    });

    const reset = await json(
      "POST",
      `/auth/password-resets/${token}`,
      { password: "brand-new-pass" },
      null,
    );
    expect(reset.status).toBe(200);
    expect(((await reset.json()) as SessionResponse).user.loginId).toBe("friend");
    expect((await get("/auth/me", m.token)).status).toBe(401);
    const login = await json(
      "POST",
      "/auth/login",
      { loginId: "friend", password: "brand-new-pass" },
      null,
    );
    expect(login.status).toBe(200);
    // 1 回だけ使える
    const again = await json(
      "POST",
      `/auth/password-resets/${token}`,
      { password: "x".repeat(12) },
      null,
    );
    expect(again.status).toBe(404);
  });

  it("新しいリンクを出すと、前のリンクは使えない。期限切れも使えない", async () => {
    const m = await member();
    const first = (await (
      await json("POST", `/users/${m.id}/password-reset`)
    ).json()) as PasswordResetCreated;
    const second = (await (
      await json("POST", `/users/${m.id}/password-reset`)
    ).json()) as PasswordResetCreated;
    expect(await (await get(`/auth/password-resets/${first.token}`, null)).json()).toEqual({
      valid: false,
    });
    db.prepare("UPDATE password_resets SET expires_at_ms = 0").run();
    expect(await (await get(`/auth/password-resets/${second.token}`, null)).json()).toEqual({
      valid: false,
    });
  });

  it("停止するとログイン・セッション・再設定リンクが使えず、再開すると戻る", async () => {
    const m = await member();
    const patch = await json("PATCH", `/users/${m.id}`, { disabled: true });
    expect(((await patch.json()) as User).disabledAtMs).not.toBeNull();
    expect((await get("/auth/me", m.token)).status).toBe(401);
    const login = await json(
      "POST",
      "/auth/login",
      { loginId: "friend", password: "member-pass-1" },
      null,
    );
    expect(login.status).toBe(403);
    expect((await json("POST", `/users/${m.id}/password-reset`)).status).toBe(409);

    await json("PATCH", `/users/${m.id}`, { disabled: false });
    const again = await json(
      "POST",
      "/auth/login",
      { loginId: "friend", password: "member-pass-1" },
      null,
    );
    expect(again.status).toBe(200);
  });

  it("権限を変えられる。自分自身は変えられず、メンバーは使えない", async () => {
    const m = await member();
    const me = (await (await get("/auth/me")).json()) as User;
    expect((await json("PATCH", `/users/${me.id}`, { role: "member" })).status).toBe(409);
    expect((await json("PATCH", `/users/${me.id}`, { disabled: true })).status).toBe(409);
    expect((await json("PATCH", `/users/${m.id}`, { role: "admin" }, m.token)).status).toBe(403);
    expect((await json("POST", `/users/${me.id}/password-reset`, undefined, m.token)).status).toBe(
      403,
    );

    const promoted = await json("PATCH", `/users/${m.id}`, { role: "admin" });
    expect(((await promoted.json()) as User).role).toBe("admin");
    expect((await get("/users", m.token)).status).toBe(200);
  });
});
