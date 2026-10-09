import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";
import { LoginLimiter } from "./rate-limit.js";

describe("hashPassword / verifyPassword", () => {
  it("同じパスワードでも毎回違うハッシュになり、照合できる", async () => {
    const a = await hashPassword("correct-horse-1");
    const b = await hashPassword("correct-horse-1");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct-horse-1", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
  });

  it("形式が違うハッシュは常に不一致", async () => {
    expect(await verifyPassword("x", "plain")).toBe(false);
  });
});

describe("LoginLimiter", () => {
  it("max 回失敗すると window の終わりまで止め、成功でリセットする", () => {
    const limiter = new LoginLimiter(3, 1000);
    for (let i = 0; i < 2; i++) limiter.fail("Me", 0);
    expect(limiter.blockedForMs("me", 10)).toBe(0);
    limiter.fail("me", 10);
    expect(limiter.blockedForMs("ME", 100)).toBe(900);
    expect(limiter.blockedForMs("me", 1000)).toBe(0);

    limiter.fail("me", 2000);
    limiter.succeed("me");
    limiter.fail("me", 2001);
    limiter.fail("me", 2002);
    expect(limiter.blockedForMs("me", 2003)).toBe(0);
  });
});
