import { describe, expect, it } from "vitest";
import { reservationCreateSchema } from "./schemas";

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
    expect(reservationCreateSchema.safeParse({ ...base, site: "mock", mode: "auto" }).success).toBe(
      true,
    );
  });

  it("エラーメッセージは日本語", () => {
    const r = reservationCreateSchema.safeParse({ ...base, eventUrl: "not-a-url" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/[ぁ-んァ-ン一-龥]/);
  });
});
