import { randomBytes } from "node:crypto";
import type {
  InvitationCreated,
  Notification,
  NotificationSettings,
  Reservation,
  SessionResponse,
} from "@zero-second/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { type Db, migrate, openDb } from "../lib/db.js";
import type { PushTarget, Senders } from "./channels.js";
import { isAllowedPushEndpoint } from "./channels.js";
import { NotificationService } from "./service.js";

const key = randomBytes(32);
const NOW = Date.UTC(2026, 9, 10, 3, 0, 0);
const MIN = 60_000;
const PUSH_ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
const WEBHOOK = "https://discord.com/api/webhooks/1/secret-token";

let db: Db;
let app: ReturnType<typeof createApp>;
let service: NotificationService;
let session: string;
let pushed: { target: PushTarget; payload: string }[];
let pushResult: "ok" | "gone" | "error";
let hooks: { url: string; kind: string; text: string }[];

function json(method: string, path: string, body?: unknown, token: string | null = session) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  return app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function reservation(overrides: Record<string, unknown> = {}, token = session) {
  const res = await json(
    "POST",
    "/reservations",
    {
      site: "mock",
      title: "テスト公演",
      eventUrl: "http://127.0.0.1:47302/events/ok",
      ticketType: "一般",
      quantity: 1,
      saleStartsAtMs: NOW + 10 * MIN,
      ...overrides,
    },
    token,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as Reservation;
}

beforeEach(async () => {
  db = openDb(":memory:");
  migrate(db);
  pushed = [];
  hooks = [];
  pushResult = "ok";
  const senders: Senders = {
    push: async (target, payload) => {
      pushed.push({ target, payload });
      return pushResult;
    },
    webhook: async (url, kind, text) => {
      hooks.push({ url, kind, text });
      return true;
    },
  };
  service = new NotificationService(db, key, senders, "http://127.0.0.1:47300");
  app = createApp({
    db,
    encryptionKey: key,
    vapid: { publicKey: "BPublic", privateKey: "private", subject: "mailto:x@example.invalid" },
    notificationService: service,
  });
  const res = await json(
    "POST",
    "/auth/setup",
    { loginId: "admin", password: "correct-horse-1" },
    null,
  );
  session = ((await res.json()) as SessionResponse).token;
});

describe("リマインド", () => {
  it("期限が来た分だけ、1 回ずつ作る", async () => {
    const r = await reservation(); // 10 分後に販売開始。既定は 30 分前・5 分前
    const first = service.collect(NOW);
    expect(first.map((n) => n.title)).toEqual(["まもなく販売開始: テスト公演"]);
    expect(first[0]?.body).toContain("あと 10 分");
    expect(first[0]?.url).toBe(`/reservations/${r.id}`);
    expect(service.collect(NOW + MIN)).toEqual([]);

    const second = service.collect(NOW + 5 * MIN);
    expect(second).toHaveLength(1);
    expect(second[0]?.body).toContain("あと 5 分");
    // 販売開始を過ぎたら作らない
    expect(service.collect(NOW + 11 * MIN)).toEqual([]);
  });

  it("複数の期限を過ぎてから登録しても、いちばん近いもの 1 通だけ", async () => {
    await reservation({ saleStartsAtMs: NOW + 3 * MIN, reminderMinutes: [60, 30, 5] });
    const created = service.collect(NOW);
    expect(created).toHaveLength(1);
    expect(created[0]?.dedupeKey).toMatch(/:5$/);
    expect(service.collect(NOW + MIN)).toEqual([]);
  });

  it("ワーカーが準備を始めた自動購入の予約にも知らせる", async () => {
    const r = await reservation({ mode: "auto", saleStartsAtMs: NOW + 4 * MIN });
    db.prepare("UPDATE reservations SET status = 'preparing' WHERE id = ?").run(r.id);
    expect(service.collect(NOW)).toHaveLength(1);
  });

  it("取り消した予約・通知なしの予約には作らない", async () => {
    const r = await reservation();
    await json("PATCH", `/reservations/${r.id}`, { status: "cancelled" });
    await reservation({ reminderMinutes: [] });
    expect(service.collect(NOW)).toEqual([]);
  });

  it("取り消しても、ほかの項目は変わらない（更新は送った項目だけ）", async () => {
    const r = await reservation({ mode: "auto", notes: "メモ", reminderMinutes: [60] });
    const res = await json("PATCH", `/reservations/${r.id}`, { status: "cancelled" });
    expect(await res.json()).toMatchObject({
      status: "cancelled",
      mode: "auto",
      notes: "メモ",
      reminderMinutes: [60],
    });
  });

  it("販売開始時刻を変えたら、もう一度知らせる", async () => {
    const r = await reservation();
    expect(service.collect(NOW)).toHaveLength(1);
    await json("PATCH", `/reservations/${r.id}`, { saleStartsAtMs: NOW + 20 * MIN });
    expect(service.collect(NOW)).toHaveLength(1);
  });
});

describe("自動購入の結果", () => {
  function insertRun(reservationId: number, result: string, extra: Record<string, unknown> = {}) {
    db.prepare(
      `INSERT INTO runs (reservation_id, mode, started_at_ms, finished_at_ms, result, error,
         payment_reference, clock_offset_ms)
       VALUES (?, 'auto', ?, ?, ?, ?, ?, ?)`,
    ).run(
      reservationId,
      NOW,
      NOW + 10 * MIN + 50,
      result,
      (extra.error as string) ?? null,
      (extra.paymentReference as string) ?? null,
      0,
    );
  }

  it("結果ごとに 1 回だけ知らせる", async () => {
    const r = await reservation({ mode: "auto", reminderMinutes: [] });
    insertRun(r.id, "succeeded", { paymentReference: "1234-5678" });
    insertRun(r.id, "needs_human", { error: "人の対応が必要です: CAPTCHA" });
    const created = service.collect(NOW + 11 * MIN);
    expect(created.map((n) => n.kind)).toEqual(["succeeded", "needs_human"]);
    expect(created[0]?.body).toBe("販売開始から 0.050 秒。払込番号 1234-5678");
    expect(created[1]?.body).toContain("CAPTCHA");
    expect(service.collect(NOW + 12 * MIN)).toEqual([]);
  });

  it("手動の記録は知らせない", async () => {
    const r = await reservation({ reminderMinutes: [] });
    await json("POST", `/reservations/${r.id}/manual-runs`, {
      result: "succeeded",
      finishedAtMs: NOW + 11 * MIN,
    });
    expect(service.collect(NOW + 12 * MIN)).toEqual([]);
  });
});

describe("届ける", () => {
  it("経路がなければ skipped", async () => {
    await reservation();
    const [n] = service.collect(NOW);
    expect(await service.deliver(n as never)).toEqual({
      pushStatus: "skipped",
      webhookStatus: "skipped",
    });
  });

  it("ブラウザ通知と Webhook に送り、無効になった購読は消す", async () => {
    await json("POST", "/notifications/push-subscriptions", {
      endpoint: PUSH_ENDPOINT,
      keys: { p256dh: "p", auth: "a" },
    });
    expect((await json("PUT", "/notifications/webhook", { webhookUrl: WEBHOOK })).status).toBe(204);

    const res = await json("POST", "/notifications/test");
    expect(await res.json()).toEqual({ pushStatus: "sent", webhookStatus: "sent" });
    expect(pushed[0]?.target.endpoint).toBe(PUSH_ENDPOINT);
    expect(JSON.parse(pushed[0]?.payload ?? "{}")).toMatchObject({ url: "/notifications" });
    expect(hooks[0]).toMatchObject({ url: WEBHOOK, kind: "discord" });
    expect(hooks[0]?.text).toContain("**zero-second のテスト通知**");
    expect(hooks[0]?.text).toContain("http://127.0.0.1:47300/notifications");

    pushResult = "gone";
    await json("POST", "/notifications/test");
    const settings = (await (
      await json("GET", "/notifications/settings")
    ).json()) as NotificationSettings;
    expect(settings.pushSubscriptionCount).toBe(0);
  });
});

describe("/notifications", () => {
  it("一覧・未読数・既読にする。ほかのユーザーの通知は見えない", async () => {
    await reservation();
    service.collect(NOW);
    expect(await (await json("GET", "/notifications/summary")).json()).toEqual({ unreadCount: 1 });
    const list = (await (await json("GET", "/notifications")).json()) as Notification[];
    expect(list[0]?.kind).toBe("reminder");

    const invite = (await (await json("POST", "/invitations", {})).json()) as InvitationCreated;
    const other = (
      (await (
        await json(
          "POST",
          `/auth/invitations/${invite.token}`,
          {
            loginId: "friend",
            password: "member-pass-1",
          },
          null,
        )
      ).json()) as SessionResponse
    ).token;
    expect(await (await json("GET", "/notifications", undefined, other)).json()).toEqual([]);

    expect((await json("POST", "/notifications/read")).status).toBe(204);
    expect(await (await json("GET", "/notifications/summary")).json()).toEqual({ unreadCount: 0 });
  });

  it("Webhook は Discord・Slack だけ。URL は暗号化して保存し、返さない", async () => {
    const bad = await json("PUT", "/notifications/webhook", { webhookUrl: "http://api:47301/x" });
    expect(bad.status).toBe(400);
    await json("PUT", "/notifications/webhook", { webhookUrl: WEBHOOK });
    const settings = await (await json("GET", "/notifications/settings")).json();
    expect(settings).toEqual({
      pushPublicKey: "BPublic",
      pushSubscriptionCount: 0,
      webhookKind: "discord",
    });
    expect(JSON.stringify(settings)).not.toContain("secret-token");
    const row = db.prepare("SELECT encrypted_webhook_url FROM notification_settings").get() as {
      encrypted_webhook_url: Uint8Array;
    };
    expect(Buffer.from(row.encrypted_webhook_url).toString("utf8")).not.toContain("secret-token");

    await json("PUT", "/notifications/webhook", { webhookUrl: null });
    expect(
      ((await (await json("GET", "/notifications/settings")).json()) as NotificationSettings)
        .webhookKind,
    ).toBeNull();
  });

  it("プッシュ通知の送り先は主なブラウザのサービスだけ", async () => {
    const res = await json("POST", "/notifications/push-subscriptions", {
      endpoint: "https://evil.example/push",
      keys: { p256dh: "p", auth: "a" },
    });
    expect(res.status).toBe(400);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(
      true,
    );
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  });
});
