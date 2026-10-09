import { describe, expect, it } from "vitest";
import { createMockSite } from "./app";

const noSleep = async () => {};

async function login(app: ReturnType<typeof createMockSite>): Promise<string> {
  const res = await app.request("/api/login", { method: "POST" });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie") ?? "";
  return cookie.split(";")[0] ?? "";
}

function order(app: ReturnType<typeof createMockSite>, cookie: string, scenario: string) {
  return app.request(`/api/events/${scenario}/orders`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ticketType: "一般", quantity: 1, paymentMethod: "convenience_store" }),
  });
}

describe("mock site", () => {
  const app = createMockSite({ sleep: noSleep });

  it("ログインしていないと購入できない", async () => {
    const res = await app.request("/api/events/ok/orders", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("ok は注文番号と払込番号を返す", async () => {
    const cookie = await login(app);
    const res = await order(app, cookie, "ok");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.orderId).toMatch(/^MOCK-\d{6}$/);
    expect(body.paymentReference).toMatch(/^\d{4}-\d{4}-\d{4}$/);
    expect(body.paymentDueAtMs).toBeGreaterThan(Date.now());
  });

  it("flaky は 2 回失敗してから成功する", async () => {
    const cookie = await login(app);
    expect((await order(app, cookie, "flaky")).status).toBe(503);
    expect((await order(app, cookie, "flaky")).status).toBe(503);
    expect((await order(app, cookie, "flaky")).status).toBe(201);
  });

  it("sold-out と captcha はエラーコードを返す", async () => {
    const cookie = await login(app);
    const soldOut = await order(app, cookie, "sold-out");
    expect(soldOut.status).toBe(409);
    expect(await soldOut.json()).toEqual({ error: "sold_out" });
    const captcha = await order(app, cookie, "captcha");
    expect(captcha.status).toBe(403);
    expect(await captcha.json()).toEqual({ error: "captcha_required" });
  });

  it("不正な注文は 400", async () => {
    const cookie = await login(app);
    const res = await app.request("/api/events/ok/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ quantity: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("Date ヘッダーにずれを足せる", async () => {
    const skewed = createMockSite({ sleep: noSleep, clockSkewMs: 60_000 });
    const res = await skewed.request("/", { method: "HEAD" });
    const date = Date.parse(res.headers.get("date") ?? "");
    expect(date - Date.now()).toBeGreaterThan(55_000);
  });

  it("存在しないシナリオは 404", async () => {
    expect((await app.request("/events/unknown")).status).toBe(404);
  });
});
