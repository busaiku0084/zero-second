import { randomBytes } from "node:crypto";
import type { Account, DashboardSummary, Reservation, Run } from "@zero-second/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { decrypt } from "./lib/crypto.js";
import { type Db, migrate, openDb } from "./lib/db.js";

const key = randomBytes(32);
let db: Db;
let app: ReturnType<typeof createApp>;

const SALE_AT = Date.UTC(2026, 9, 10, 3, 0, 0);

function json(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  app = createApp({ db, encryptionKey: key });
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
    expect((await app.request("/sites")).status).toBe(401);
    expect((await app.request("/health")).status).toBe(200);
    const ok = await app.request("/sites", { headers: { authorization: "Bearer secret" } });
    expect(ok.status).toBe(200);
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
    const res = await app.request(`/reservations/${created.id}`);
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
    expect(((await runRes.json()) as Run).elapsedMs).toBe(42_000);
    await json("POST", `/reservations/${b.id}/manual-runs`, {
      result: "sold_out",
      finishedAtMs: SALE_AT + 90_000,
    });

    const detail = (await (await app.request(`/reservations/${a.id}`)).json()) as Reservation;
    expect(detail.status).toBe("succeeded");

    const summary = (await (await app.request("/dashboard?range=all")).json()) as DashboardSummary;
    expect(summary).toMatchObject({
      runCount: 2,
      succeededCount: 1,
      medianElapsedMs: 42_000,
      fastestElapsedMs: 42_000,
    });
    expect(summary.resultCounts.sold_out).toBe(1);
    expect(summary.series).toHaveLength(2);
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
