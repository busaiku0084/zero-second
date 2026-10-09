import { describe, expect, it } from "vitest";
import { elapsedMs } from "./rows";

describe("elapsedMs", () => {
  it("ずれが無ければ 完了 − 販売開始", () => {
    expect(elapsedMs(10_050, 10_000, null)).toBe(50);
  });

  it("サーバーの時計が進んでいるとき、端末の時刻にずれを足してから引く", () => {
    // サーバーが 1234ms 進んでいる。端末で 8816 に送ると、サーバーでは 10050 に届く
    expect(elapsedMs(8_816, 10_000, 1_234)).toBe(50);
  });
});
