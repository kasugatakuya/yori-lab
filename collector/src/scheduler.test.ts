import { describe, expect, it } from "vitest";
import { isWeekend, phaseAt } from "./scheduler";
import { parseHms } from "./time";

const c = { authAfterSec: parseHms("06:30"), startSec: parseHms("08:00"), endSec: parseHms("09:30"), dailyBarAtSec: parseHms("15:40"), prepareLeadSec: 120 };

describe("phaseAt", () => {
  it("時間帯ごとのフェーズ", () => {
    expect(phaseAt(parseHms("06:00"), c, false)).toBe("idle");
    expect(phaseAt(parseHms("07:00"), c, false)).toBe("idle");
    expect(phaseAt(parseHms("07:58"), c, false)).toBe("prepare");
    expect(phaseAt(parseHms("08:00"), c, false)).toBe("recording");
    expect(phaseAt(parseHms("09:29:59"), c, false)).toBe("recording");
    expect(phaseAt(parseHms("09:30"), c, false)).toBe("wait-close");
    expect(phaseAt(parseHms("15:40"), c, false)).toBe("daily-bar");
    expect(phaseAt(parseHms("15:40"), c, true)).toBe("done");
  });
  it("isWeekend", () => {
    expect(isWeekend("2026-11-01")).toBe(true); // 日曜
    expect(isWeekend("2026-11-04")).toBe(false);
  });
});
