import { describe, expect, it } from "vitest";
import { floorToMinutes, jstDate, jstDateTime, jstSecondsOfDay, nowJstIso, parseHms } from "./time";

describe("time (JST)", () => {
  it("nowJstIso は +09:00 付き", () => {
    expect(nowJstIso(new Date("2026-11-04T00:00:05.123Z"))).toBe("2026-11-04T09:00:05.123+09:00");
  });
  it("jstDate / jstSecondsOfDay", () => {
    expect(jstDate(new Date("2026-11-03T23:30:00Z"))).toBe("2026-11-04");
    expect(jstSecondsOfDay(new Date("2026-11-03T23:30:00Z"))).toBe(8 * 3600 + 30 * 60);
  });
  it("parseHms / jstDateTime", () => {
    expect(parseHms("08:00")).toBe(28800);
    expect(parseHms("9:30:15")).toBe(34215);
    expect(jstDateTime("2026-11-04", parseHms("09:00")).toISOString()).toBe("2026-11-04T00:00:00.000Z");
  });
  it("floorToMinutes", () => {
    expect(floorToMinutes("2026-11-04T09:07:45.000+09:00", 1)).toBe("2026-11-04T09:07:00+09:00");
    expect(floorToMinutes("2026-11-04T09:07:45.000+09:00", 5)).toBe("2026-11-04T09:05:00+09:00");
    expect(floorToMinutes("2026-11-04T00:07:45.000Z", 5)).toBe("2026-11-04T09:05:00+09:00");
  });
});
