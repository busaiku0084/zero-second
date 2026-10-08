import { describe, expect, it } from "vitest";
import { formatDuration, formatElapsed, fromJstInput, toJstInput } from "./format";

describe("formatElapsed", () => {
  it("ラップタイム風に表す", () => {
    expect(formatElapsed(42_318)).toBe("+00:42.318");
    expect(formatElapsed(3_723_004)).toBe("+1:02:03.004");
    expect(formatElapsed(-1_500)).toBe("−00:01.500");
  });
});

describe("formatDuration", () => {
  it("1 秒未満は ms、以上は秒", () => {
    expect(formatDuration(212)).toBe("212 ms");
    expect(formatDuration(1_250)).toBe("1.25 s");
  });
});

describe("日本時間の入力値", () => {
  const ms = Date.UTC(2026, 9, 10, 3, 0, 30); // 2026-10-10 12:00:30 JST

  it("UNIX ミリ秒と相互に変換できる", () => {
    expect(toJstInput(ms)).toBe("2026-10-10T12:00:30");
    expect(fromJstInput("2026-10-10T12:00:30")).toBe(ms);
  });

  it("秒を省略した入力も受け付ける", () => {
    expect(fromJstInput("2026-10-10T12:00")).toBe(ms - 30_000);
  });

  it("不正な値は null", () => {
    expect(fromJstInput("")).toBeNull();
    expect(fromJstInput("2026/10/10 12:00")).toBeNull();
  });
});
