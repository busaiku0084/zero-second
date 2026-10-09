import { describe, expect, it } from "vitest";
import { reservationCreateSchema, reservationUpdateSchema, webhookKind } from "./schemas";

const base = {
  site: "ticketdive",
  title: "公演",
  eventUrl: "https://ticketdive.com/event/x",
  ticketType: "一般",
  quantity: 1,
  saleStartsAtMs: 1,
};

describe("reservationCreateSchema", () => {
  it("既定は手動購入", () => {
    expect(reservationCreateSchema.parse(base).mode).toBe("manual");
  });

  it("規約で自動化が禁止されたサイトでは auto を拒否する", () => {
    expect(reservationCreateSchema.safeParse({ ...base, mode: "auto" }).success).toBe(false);
    expect(
      reservationCreateSchema.safeParse({ ...base, site: "livepocket", mode: "auto" }).success,
    ).toBe(false);
    expect(
      reservationCreateSchema.safeParse({
        ...base,
        site: "mock",
        eventUrl: "http://127.0.0.1:47302/events/ok",
        mode: "auto",
      }).success,
    ).toBe(true);
  });

  it("公演 URL は選んだサイトのホスト（サブドメインを含む）に限る", () => {
    const parse = (site: string, eventUrl: string) =>
      reservationCreateSchema.safeParse({ ...base, site, eventUrl }).success;
    expect(parse("ticketdive", "https://ticketdive.com/event/x")).toBe(true);
    expect(parse("livepocket", "https://t.livepocket.jp/e/abc")).toBe(true);
    expect(parse("ticketdive", "https://livepocket.jp/e/abc")).toBe(false);
    expect(parse("ticketdive", "https://ticketdive.com.example.com/event/x")).toBe(false);
    expect(parse("mock", "https://ticketdive.com/event/x")).toBe(false);
  });

  it("エラーメッセージは日本語", () => {
    const r = reservationCreateSchema.safeParse({ ...base, eventUrl: "not-a-url" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/[ぁ-んァ-ン一-龥]/);
  });
});

describe("reservationUpdateSchema", () => {
  it("送った項目だけを返す（既定値で上書きしない）", () => {
    expect(reservationUpdateSchema.parse({ status: "cancelled" })).toEqual({ status: "cancelled" });
    expect(reservationUpdateSchema.parse({ quantity: 2 })).toEqual({ quantity: 2 });
  });
});

describe("通知", () => {
  it("通知のタイミングは重複を除いて多い順にする。既定は 30 分前・5 分前", () => {
    expect(reservationCreateSchema.parse(base).reminderMinutes).toEqual([30, 5]);
    expect(
      reservationCreateSchema.parse({ ...base, reminderMinutes: [5, 60, 5] }).reminderMinutes,
    ).toEqual([60, 5]);
  });

  it("Webhook は Discord・Slack の URL だけ", () => {
    expect(webhookKind("https://discord.com/api/webhooks/1/abc")).toBe("discord");
    expect(webhookKind("https://hooks.slack.com/services/T/B/x")).toBe("slack");
    expect(webhookKind("http://discord.com/api/webhooks/1/abc")).toBeNull();
    expect(webhookKind("https://discord.com.evil.example/api/webhooks/")).toBeNull();
    expect(webhookKind("http://api:47301/")).toBeNull();
  });
});
