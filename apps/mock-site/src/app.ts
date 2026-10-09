import { randomInt, randomUUID } from "node:crypto";
import { findMockScenario, MOCK_SCENARIOS, type MockScenario } from "@zero-second/shared";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";

/**
 * 検証用のチケットサイト。striker の mock アダプタが購入しに来る（ADR 0012）。
 * 実在のサイトの API を真似たものではない。
 */
export type MockSiteOptions = {
  /** 各リクエストに足す応答の遅れ（ミリ秒）。0〜2 倍の範囲でばらつかせる */
  latencyMs?: number;
  /** Date ヘッダーに足すずれ（ミリ秒）。時刻合わせの確認用 */
  clockSkewMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const SESSION_COOKIE = "mock_session";
/** flaky シナリオで、成功するまでに返す失敗の回数 */
const FLAKY_FAILURES = 2;
const SLOW_PURCHASE_MS = 800;
/** コンビニ払いの支払期限: 注文から 3 日 */
const PAYMENT_DUE_MS = 3 * 24 * 60 * 60 * 1000;

type Session = { failures: number };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function paymentReference(): string {
  return Array.from({ length: 3 }, () => String(randomInt(10_000)).padStart(4, "0")).join("-");
}

export function createMockSite({
  latencyMs = 0,
  clockSkewMs = 0,
  sleep = defaultSleep,
}: MockSiteOptions = {}) {
  const sessions = new Map<string, Session>();
  let orderSeq = 0;

  const app = new Hono<{ Variables: { session: Session } }>();

  app.use(async (c, next) => {
    if (latencyMs > 0) await sleep(Math.round(Math.random() * latencyMs * 2));
    await next();
    c.header("Date", new Date(Date.now() + clockSkewMs).toUTCString());
  });

  // ---- 画面（予約詳細の「公演ページを開く」から開く） ----

  const page = (title: string, body: ReturnType<typeof html>) => html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>${title} | モックサイト</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 16px; line-height: 1.7; }
          code { background: #8882; padding: 0 4px; border-radius: 4px; }
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`;

  const scenarioItem = (s: MockScenario) =>
    html`<li><a href="/events/${s.id}">${s.name}</a>（<code>${s.id}</code>）: ${s.description}</li>`;

  app.get("/", (c) =>
    c.html(
      page(
        "公演一覧",
        html`<h1>zero-second モックサイト</h1>
          <p>検証用のチケットサイトです。公演 URL の末尾でシナリオを選びます。</p>
          <ul>
            ${MOCK_SCENARIOS.map(scenarioItem)}
          </ul>`,
      ),
    ),
  );

  app.get("/events/:id", (c) => {
    const scenario = findMockScenario(c.req.param("id"));
    if (!scenario) return c.notFound();
    return c.html(
      page(
        scenario.name,
        html`<p><a href="/">← 公演一覧</a></p>
          <h1>モック公演「${scenario.name}」</h1>
          <p>${scenario.description}</p>`,
      ),
    );
  });

  // ---- API（striker の mock アダプタが使う） ----

  app.post("/api/login", (c) => {
    const id = randomUUID();
    sessions.set(id, { failures: 0 });
    setCookie(c, SESSION_COOKIE, id, { httpOnly: true, sameSite: "Lax", path: "/" });
    return c.json({ ok: true });
  });

  app.use("/api/events/*", async (c, next) => {
    const session = sessions.get(getCookie(c, SESSION_COOKIE) ?? "");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("session", session);
    await next();
  });

  app.get("/api/events/:id", (c) => {
    const scenario = findMockScenario(c.req.param("id"));
    if (!scenario) return c.json({ error: "not_found" }, 404);
    return c.json({
      id: scenario.id,
      title: `モック公演「${scenario.name}」`,
      tickets: [{ name: "一般", remaining: scenario.id === "sold-out" ? 0 : 100 }],
    });
  });

  app.post("/api/events/:id/orders", async (c) => {
    const scenario = findMockScenario(c.req.param("id"));
    if (!scenario) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const quantity = Number(body?.quantity);
    if (typeof body?.ticketType !== "string" || !Number.isInteger(quantity) || quantity < 1) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const session = c.get("session");
    switch (scenario.id) {
      case "sold-out":
        return c.json({ error: "sold_out" }, 409);
      case "captcha":
        return c.json({ error: "captcha_required" }, 403);
      case "flaky":
        if (session.failures < FLAKY_FAILURES) {
          session.failures += 1;
          return c.json({ error: "temporarily_unavailable" }, 503);
        }
        break;
      case "slow":
        await sleep(SLOW_PURCHASE_MS);
        break;
    }

    orderSeq += 1;
    return c.json(
      {
        orderId: `MOCK-${String(orderSeq).padStart(6, "0")}`,
        paymentReference: paymentReference(),
        paymentDueAtMs: Date.now() + PAYMENT_DUE_MS,
      },
      201,
    );
  });

  return app;
}
