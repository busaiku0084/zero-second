import { randomInt, randomUUID } from "node:crypto";
import {
  findMockScenario,
  MOCK_MAX_PER_ORDER,
  MOCK_SCENARIOS,
  MOCK_TICKET_TYPES,
  type MockScenario,
} from "@zero-second/shared";
import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * 検証用のチケットサイト。striker の mock アダプタが購入しに来る（ADR 0012, 0022）。
 * 実在のサイトの API や画面を真似たものではない。
 *
 * 同じ購入を 2 つの方法で受け付ける（アダプタの API / ブラウザ操作の骨格を両方確かめるため）:
 * - API: `POST /api/login` → `GET /api/events/:id` → `POST /api/events/:id/orders`（JSON）
 * - 画面: `/login` → `/events/:id`（席種・枚数を選ぶ）→ 「購入する」→ `/orders/:orderId`
 *
 * 画面の要素には `data-test` 属性を付ける（ブラウザ操作のセレクタに使う）。
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

type Session = {
  failures: number;
  /** 画面の購入フォームに埋める CSRF トークン */
  csrf: string;
  /** ログインに使った ID（画面の表示用。パスワードは受け取っても持たない） */
  loginId: string;
};

type Order = {
  orderId: string;
  paymentReference: string;
  paymentDueAtMs: number;
  title: string;
  ticketType: string;
  quantity: number;
};

/** 注文できなかった理由。API はこのコードを JSON で、画面は文言で返す */
type OrderError = {
  status: ContentfulStatusCode;
  error:
    | "sold_out"
    | "captcha_required"
    | "temporarily_unavailable"
    | "invalid_request"
    | "unknown_ticket_type"
    | "over_limit";
};

const ORDER_ERROR_MESSAGES: Record<OrderError["error"], string> = {
  sold_out: "売り切れました",
  captcha_required: "画像認証（CAPTCHA）に答えてください",
  temporarily_unavailable: "混み合っています。少し待ってからやり直してください",
  invalid_request: "入力が正しくありません",
  unknown_ticket_type: "その席種はありません",
  over_limit: `1 回の注文は ${MOCK_MAX_PER_ORDER} 枚までです`,
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function paymentReference(): string {
  return Array.from({ length: 3 }, () => String(randomInt(10_000)).padStart(4, "0")).join("-");
}

export function eventTitle(scenario: MockScenario): string {
  return `モック公演「${scenario.name}」`;
}

/** 公演情報（API と画面で共通） */
function eventInfo(scenario: MockScenario) {
  return {
    id: scenario.id,
    title: eventTitle(scenario),
    description: scenario.description,
    tickets: MOCK_TICKET_TYPES.map((t) => ({
      name: t.name,
      price: t.price,
      remaining: scenario.id === "sold-out" ? 0 : 100,
    })),
    maxPerOrder: MOCK_MAX_PER_ORDER,
  };
}

export function createMockSite({
  latencyMs = 0,
  clockSkewMs = 0,
  sleep = defaultSleep,
}: MockSiteOptions = {}) {
  const sessions = new Map<string, Session>();
  const orders = new Map<string, Order & { session: string }>();
  let orderSeq = 0;

  const app = new Hono();

  app.use(async (c, next) => {
    if (latencyMs > 0) await sleep(Math.round(Math.random() * latencyMs * 2));
    await next();
    c.header("Date", new Date(Date.now() + clockSkewMs).toUTCString());
  });

  function startSession(c: Context, loginId: string): Session {
    const id = randomUUID();
    const session = { failures: 0, csrf: randomUUID(), loginId };
    sessions.set(id, session);
    setCookie(c, SESSION_COOKIE, id, { httpOnly: true, sameSite: "Lax", path: "/" });
    return session;
  }

  function currentSession(c: Context): [string, Session] | undefined {
    const id = getCookie(c, SESSION_COOKIE) ?? "";
    const session = sessions.get(id);
    return session ? [id, session] : undefined;
  }

  /** 注文する（API と画面で共通）。シナリオごとの振る舞いはここだけで決める */
  async function placeOrder(
    session: Session,
    scenario: MockScenario,
    ticketType: unknown,
    quantity: number,
  ): Promise<Order | OrderError> {
    if (typeof ticketType !== "string" || !Number.isInteger(quantity) || quantity < 1) {
      return { status: 400, error: "invalid_request" };
    }
    if (!MOCK_TICKET_TYPES.some((t) => t.name === ticketType)) {
      return { status: 400, error: "unknown_ticket_type" };
    }
    if (quantity > MOCK_MAX_PER_ORDER) return { status: 400, error: "over_limit" };

    switch (scenario.id) {
      case "sold-out":
        return { status: 409, error: "sold_out" };
      case "captcha":
        return { status: 403, error: "captcha_required" };
      case "flaky":
        if (session.failures < FLAKY_FAILURES) {
          session.failures += 1;
          return { status: 503, error: "temporarily_unavailable" };
        }
        break;
      case "slow":
        await sleep(SLOW_PURCHASE_MS);
        break;
    }

    orderSeq += 1;
    return {
      orderId: `MOCK-${String(orderSeq).padStart(6, "0")}`,
      paymentReference: paymentReference(),
      paymentDueAtMs: Date.now() + PAYMENT_DUE_MS,
      title: eventTitle(scenario),
      ticketType,
      quantity,
    };
  }

  // ---- 画面（予約詳細の「公演ページを開く」と、ブラウザ操作のアダプタが使う） ----

  const page = (
    c: Context,
    title: string,
    body: ReturnType<typeof html>,
    status: ContentfulStatusCode = 200,
  ) => {
    const session = currentSession(c)?.[1];
    return c.html(
      html`<!doctype html>
        <html lang="ja">
          <head>
            <meta charset="utf-8" />
            <title>${title} | モックサイト</title>
            <style>
              body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 16px; line-height: 1.7; }
              header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #8884; margin-bottom: 1.5rem; }
              code { background: #8882; padding: 0 4px; border-radius: 4px; }
              form { display: grid; gap: 12px; max-width: 20rem; }
              .notice { padding: 8px 12px; border: 1px solid #c33; border-radius: 6px; }
            </style>
          </head>
          <body>
            <header>
              <a href="/">zero-second モックサイト</a>
              ${
                session
                  ? html`<span data-test="account">ログイン中: ${session.loginId || "ゲスト"}</span>`
                  : html`<a href="/login" data-test="login-link">ログイン</a>`
              }
            </header>
            ${body}
          </body>
        </html>`,
      status,
    );
  };

  const scenarioItem = (s: MockScenario) =>
    html`<li><a href="/events/${s.id}">${s.name}</a>（<code>${s.id}</code>）: ${s.description}</li>`;

  app.get("/", (c) =>
    page(
      c,
      "公演一覧",
      html`<h1>公演一覧</h1>
        <p>検証用のチケットサイトです。公演 URL の末尾でシナリオを選びます。</p>
        <ul>
          ${MOCK_SCENARIOS.map(scenarioItem)}
        </ul>`,
    ),
  );

  app.get("/login", (c) => {
    const next = safeNext(c.req.query("next"));
    return page(
      c,
      "ログイン",
      html`<h1>ログイン</h1>
        <p>検証用なので、どの ID・パスワードでもログインできます。</p>
        <form method="post" action="/login" data-test="login-form">
          <input type="hidden" name="next" value="${next}" />
          <label>ログイン ID <input name="loginId" data-test="login-id" autocomplete="username" /></label>
          <label>パスワード <input name="password" type="password" data-test="password" autocomplete="current-password" /></label>
          <button type="submit" data-test="login-button">ログイン</button>
        </form>`,
    );
  });

  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    startSession(c, typeof form.loginId === "string" ? form.loginId.slice(0, 64) : "");
    return c.redirect(safeNext(form.next), 303);
  });

  app.get("/events/:id", (c) => {
    const scenario = findMockScenario(c.req.param("id"));
    if (!scenario) return c.notFound();
    const event = eventInfo(scenario);
    const session = currentSession(c)?.[1];
    return page(
      c,
      scenario.name,
      html`<p><a href="/">← 公演一覧</a></p>
        <h1 data-test="event-title">${event.title}</h1>
        <p>${scenario.description}</p>
        <table>
          <tr><th>席種</th><th>料金</th><th>残り</th></tr>
          ${event.tickets.map(
            (t) =>
              html`<tr><td>${t.name}</td><td>${t.price.toLocaleString()} 円</td><td>${t.remaining}</td></tr>`,
          )}
        </table>
        ${
          session
            ? html`<form method="post" action="/events/${scenario.id}/purchase" data-test="purchase-form">
                <input type="hidden" name="csrf" value="${session.csrf}" />
                <label>席種
                  <select name="ticketType" data-test="ticket-type">
                    ${event.tickets.map((t) => html`<option value="${t.name}">${t.name}</option>`)}
                  </select>
                </label>
                <label>枚数
                  <select name="quantity" data-test="quantity">
                    ${Array.from({ length: MOCK_MAX_PER_ORDER }, (_, i) => html`<option value="${i + 1}">${i + 1} 枚</option>`)}
                  </select>
                </label>
                <button type="submit" data-test="purchase">購入する（コンビニ払い）</button>
              </form>`
            : html`<p><a href="/login?next=/events/${scenario.id}" data-test="login-link">ログインして購入する</a></p>`
        }`,
    );
  });

  app.post("/events/:id/purchase", async (c) => {
    const scenario = findMockScenario(c.req.param("id"));
    if (!scenario) return c.notFound();
    const current = currentSession(c);
    if (!current) return c.redirect(`/login?next=/events/${scenario.id}`, 303);
    const [sessionId, session] = current;
    const form = await c.req.parseBody();
    if (form.csrf !== session.csrf) {
      return page(
        c,
        "エラー",
        html`<p class="notice" data-test="error">画面が古くなりました。公演ページを開き直してください</p>`,
        403,
      );
    }

    const result = await placeOrder(session, scenario, form.ticketType, Number(form.quantity));
    if ("error" in result) {
      // 売り切れと CAPTCHA は、ブラウザ操作のアダプタが見分けられるよう専用の印を付ける
      const marker =
        result.error === "sold_out"
          ? "sold-out"
          : result.error === "captcha_required"
            ? "captcha"
            : "error";
      return page(
        c,
        "購入できませんでした",
        html`<h1>購入できませんでした</h1>
          <p class="notice" data-test="${marker}">${ORDER_ERROR_MESSAGES[result.error]}</p>
          <p><a href="/events/${scenario.id}">公演ページに戻る</a></p>`,
        result.status,
      );
    }
    orders.set(result.orderId, { ...result, session: sessionId });
    return c.redirect(`/orders/${result.orderId}`, 303);
  });

  app.get("/orders/:orderId", (c) => {
    const order = orders.get(c.req.param("orderId"));
    if (!order || order.session !== currentSession(c)?.[0]) return c.notFound();
    return page(
      c,
      "購入できました",
      html`<h1 data-test="complete">購入できました</h1>
        <dl>
          <dt>注文番号</dt><dd data-test="order-id">${order.orderId}</dd>
          <dt>公演</dt><dd>${order.title}（${order.ticketType} × ${order.quantity} 枚）</dd>
          <dt>払込番号</dt><dd data-test="payment-reference">${order.paymentReference}</dd>
          <dt>支払期限</dt>
          <dd data-test="payment-due" data-ms="${order.paymentDueAtMs}">
            ${new Date(order.paymentDueAtMs).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
          </dd>
        </dl>`,
    );
  });

  // ---- API（striker の mock アダプタが API で買うときに使う） ----

  app.post("/api/login", (c) => {
    startSession(c, "");
    return c.json({ ok: true });
  });

  /** 公演情報はログインなしで読める（予約の登録画面の自動入力にも使う） */
  app.get("/api/events/:id", (c) => {
    const scenario = findMockScenario(c.req.param("id"));
    if (!scenario) return c.json({ error: "not_found" }, 404);
    return c.json(eventInfo(scenario));
  });

  app.post("/api/events/:id/orders", async (c) => {
    const session = currentSession(c)?.[1];
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const scenario = findMockScenario(c.req.param("id"));
    if (!scenario) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const result = await placeOrder(session, scenario, body?.ticketType, Number(body?.quantity));
    if ("error" in result) return c.json({ error: result.error }, result.status);
    return c.json(
      {
        orderId: result.orderId,
        paymentReference: result.paymentReference,
        paymentDueAtMs: result.paymentDueAtMs,
      },
      201,
    );
  });

  return app;
}

/** ログイン後に戻る先。サイトの中のパスだけを受け付ける（オープンリダイレクトを防ぐ） */
function safeNext(value: unknown): string {
  return typeof value === "string" && /^\/(?!\/)[\w\-./?=&]*$/.test(value) ? value : "/";
}
