import { describe, expect, it } from "vitest";
import type { DailyBar } from "@/lib/db/types";
import { parseSelectionConfig, selectSymbols } from "./select-symbols";

const bar = (code: string, date: string, o: number, h: number, l: number, c: number, v: number): DailyBar => ({
  code, date, source: "jquants", open: o, high: h, low: l, close: c, volume: v, turnover: v * c, adjFactor: 1, adjOpen: o, adjHigh: h, adjLow: l, adjClose: c, adjVolume: v, upperLimit: false, lowerLimit: false, fetchedAt: "x",
});

describe("selectSymbols", () => {
  const config = parseSelectionConfig({ maxSymbols: 2, lookbackDays: 2, weights: { turnover: 1, range: 1, gapAbs: 0 } });
  it("売買代金と値幅の順位で選び、データが無い銘柄は universe 順で補う", () => {
    const r = selectSymbols(
      [
        { code: "A", bars: [bar("A", "d1", 100, 101, 99, 100, 1000), bar("A", "d2", 100, 101, 99, 100, 1000)] },
        { code: "B", bars: [bar("B", "d1", 100, 110, 90, 100, 5000), bar("B", "d2", 100, 110, 90, 100, 5000)] },
        { code: "C", bars: [] },
      ],
      config,
      ["C", "A", "B"],
    );
    expect(r.selected).toEqual(["B", "A"]);
    expect(r.scored[0].code).toBe("B");
    const r2 = selectSymbols([{ code: "C", bars: [] }], config, ["C", "D", "E"]);
    expect(r2.selected).toEqual(["C", "D"]);
  });
  it("除外と固定を反映", () => {
    const cfg = parseSelectionConfig({ maxSymbols: 2, excludeCodes: ["B"], alwaysInclude: ["Z"] });
    const r = selectSymbols([{ code: "A", bars: [bar("A", "d1", 1, 1, 1, 1, 1), bar("A", "d2", 1, 1, 1, 1, 1)] }, { code: "B", bars: [bar("B", "d2", 1, 1, 1, 1, 9)] }], cfg, ["A", "B"]);
    expect(r.selected).toEqual(["Z", "A"]);
  });
  it("parseSelectionConfig の既定値と上限", () => {
    const c = parseSelectionConfig({ maxSymbols: 500 });
    expect(c.maxSymbols).toBe(50);
    expect(c.lookbackDays).toBe(5);
  });
});
