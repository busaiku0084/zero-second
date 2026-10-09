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

  it("販売開始より前に終わった実行（準備の段階での失敗）は null", () => {
    expect(elapsedMs(9_000, 10_000, null)).toBeNull();
    // 端末の時刻では開始後でも、サーバーの時計にそろえると開始前
    expect(elapsedMs(10_050, 10_000, -100)).toBeNull();
  });

  it("販売開始ちょうどに終わったら 0", () => {
    expect(elapsedMs(10_000, 10_000, null)).toBe(0);
  });
});
