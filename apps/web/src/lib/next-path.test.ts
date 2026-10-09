import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("同じサイトのパスはそのまま", () => {
    expect(safeNextPath("/reservations/3?x=1")).toBe("/reservations/3?x=1");
  });

  it("外部のサイト・不正な値はトップにする", () => {
    for (const v of [undefined, null, "", "https://evil.example", "//evil.example", "/\\evil"]) {
      expect(safeNextPath(v)).toBe("/");
    }
  });
});
