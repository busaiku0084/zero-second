import { describe, expect, it } from "vitest";
import { describeOffset, estimateOffset } from "./clock";

describe("estimateOffset", () => {
  it("往復時間がいちばん短い測定から、真ん中の時刻とのずれを出す", () => {
    expect(
      estimateOffset([
        { t0: 1000, t1: 1200, server: 1600 }, // 往復 200ms
        { t0: 2000, t1: 2020, server: 2510 }, // 往復 20ms → 2510 − 2010
      ]),
    ).toEqual({ offsetMs: 500, uncertaintyMs: 10 });
  });

  it("測定がなければ null", () => {
    expect(estimateOffset([])).toBeNull();
    expect(estimateOffset([{ t0: 10, t1: 5, server: 0 }])).toBeNull();
  });
});

describe("describeOffset", () => {
  it("誤差の範囲内なら正確、それ以外は向きと量を伝える", () => {
    expect(describeOffset({ offsetMs: 3, uncertaintyMs: 5 })).toBe(
      "端末の時計は正確です（±0.005 秒）",
    );
    expect(describeOffset({ offsetMs: 1234, uncertaintyMs: 8 })).toContain("1.234 秒遅れて");
    expect(describeOffset({ offsetMs: -500, uncertaintyMs: 8 })).toContain("0.500 秒進んで");
  });
});
