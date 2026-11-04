import { describe, expect, it } from "vitest";
import { addDays, addWeeks, addYears, normalizeYmd, parseYmd, toCompactYmd, todayJst } from "./dates";

describe("dates", () => {
  it("todayJst はJST基準の暦日", () => {
    // 2026-10-29T16:00Z は JST では 10/30 01:00
    expect(todayJst(new Date("2026-10-29T16:00:00Z"))).toBe("2026-10-30");
    expect(todayJst(new Date("2026-10-29T14:59:00Z"))).toBe("2026-10-29");
  });
  it("parse / normalize", () => {
    expect(normalizeYmd("20260101")).toBe("2026-01-01");
    expect(normalizeYmd("2026-01-01")).toBe("2026-01-01");
    expect(() => parseYmd("2026/01/01")).toThrow();
  });
  it("add helpers", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addWeeks("2026-10-29", -12)).toBe("2026-08-06");
    expect(addYears("2024-02-29", 2)).toBe("2026-03-01");
  });
  it("toCompactYmd", () => {
    expect(toCompactYmd("2026-10-29")).toBe("20261029");
  });
});
