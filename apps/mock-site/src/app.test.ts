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

  it("公演情報はログインなしで読め、席種と枚数の上限を返す", async () => {
    const res = await app.request("/api/events/ok");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      title: "モック公演「成功」",
      tickets: [{ name: "一般" }, { name: "前方エリア" }],
      maxPerOrder: 4,
    });
  });

  it("ない席種と、上限を超える枚数は 400", async () => {
    const cookie = await login(app);
    const send = (ticketType: string, quantity: number) =>
      app.request("/api/events/ok/orders", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ticketType, quantity }),
      });
    expect(await (await send("S席", 1)).json()).toEqual({ error: "unknown_ticket_type" });
    expect(await (await send("一般", 5)).json()).toEqual({ error: "over_limit" });
    expect((await send("前方エリア", 4)).status).toBe(201);
  });
});

describe("mock site の画面での購入", () => {
  const app = createMockSite({ sleep: noSleep });
  const form = (fields: Record<string, string>) => ({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

  async function loginByForm(): Promise<string> {
    const res = await app.request(
      "/login",
      form({ loginId: "me", password: "x", next: "/events/ok" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/events/ok");
    return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }

  async function csrfOf(cookie: string, scenario: string): Promise<string> {
    const page = await (await app.request(`/events/${scenario}`, { headers: { cookie } })).text();
    expect(page).toContain('data-test="purchase-form"');
    return /name="csrf" value="([^"]+)"/.exec(page)?.[1] ?? "";
  }

  function purchase(cookie: string, scenario: string, fields: Record<string, string>) {
    const init = form(fields);
    return app.request(`/events/${scenario}/purchase`, {
      ...init,
      headers: { ...init.headers, cookie },
    });
  }

  it("ログインしていなければ購入フォームを出さない", async () => {
    const page = await (await app.request("/events/ok")).text();
    expect(page).not.toContain('data-test="purchase-form"');
    expect(page).toContain('data-test="login-link"');
  });

  it("ログイン → 席種・枚数を選んで購入 → 注文の画面", async () => {
    const cookie = await loginByForm();
    const csrf = await csrfOf(cookie, "ok");
    const res = await purchase(cookie, "ok", { csrf, ticketType: "前方エリア", quantity: "2" });
    expect(res.status).toBe(303);
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^\/orders\/MOCK-\d{6}$/);
    const done = await (await app.request(location, { headers: { cookie } })).text();
    expect(done).toContain('data-test="order-id"');
    expect(done).toContain("前方エリア × 2 枚");
    // ほかの人（別のセッション）には見せない
    expect((await app.request(location)).status).toBe(404);
  });

  it("CSRF トークンが違えば 403", async () => {
    const cookie = await loginByForm();
    const res = await purchase(cookie, "ok", { csrf: "x", ticketType: "一般", quantity: "1" });
    expect(res.status).toBe(403);
  });

  it("売り切れ・CAPTCHA は、それぞれの印を付けた画面を返す", async () => {
    const cookie = await loginByForm();
    for (const [scenario, marker, status] of [
      ["sold-out", "sold-out", 409],
      ["captcha", "captcha", 403],
      ["flaky", "error", 503],
    ] as const) {
      const csrf = await csrfOf(cookie, scenario);
      const res = await purchase(cookie, scenario, { csrf, ticketType: "一般", quantity: "1" });
      expect(res.status).toBe(status);
      expect(await res.text()).toContain(`data-test="${marker}"`);
    }
  });

  it("ログイン後の戻り先は、サイトの中のパスだけ", async () => {
    const res = await app.request("/login", form({ next: "//evil.example.com/" }));
    expect(res.headers.get("location")).toBe("/");
  });
});
