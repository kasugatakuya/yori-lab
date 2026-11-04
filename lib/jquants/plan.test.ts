import { describe, expect, it } from "vitest";
import { getAvailableWindow } from "./plan";

describe("getAvailableWindow", () => {
  it("free は 12週間前〜2年12週間前", () => {
    const w = getAvailableWindow("free", "2026-10-29");
    expect(w.to).toBe("2026-08-06");
    expect(w.from).toBe("2024-08-06");
    expect(w.delayWeeks).toBe(12);
  });
  it("light は当日まで5年", () => {
    const w = getAvailableWindow("light", "2026-10-29");
    expect(w.to).toBe("2026-10-29");
    expect(w.from).toBe("2021-10-29");
  });
});
