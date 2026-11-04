import { describe, expect, it } from "vitest";
import type { DailyBar } from "@/lib/db/types";
import { evaluateTrade, runBacktest } from "./backtest";
import { computeDailyMetrics, takeRecent } from "./metrics";
import { rankStocks, summarizeStock } from "./ranking";
import { bucketOf, byGapBucket, byGapDirection, maxDrawdown, median, stdev, summarizeOpenToClose } from "./stats";
import type { DailyMetric } from "./types";

function bar(date: string, o: number, h: number, l: number, c: number, v = 1000, extra: Partial<DailyBar> = {}): DailyBar {
  return {
    code: "7203",
    date,
    source: "jquants",
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    turnover: null,
    adjFactor: 1,
    adjOpen: o,
    adjHigh: h,
    adjLow: l,
    adjClose: c,
    adjVolume: v,
    upperLimit: false,
    lowerLimit: false,
    fetchedAt: "x",
    ...extra,
  };
}

describe("computeDailyMetrics", () => {
  it("ギャップ率・寄り引け・高安率・出来高比を計算し、最初の日は出力しない", () => {
    const bars = [bar("2026-01-05", 100, 110, 95, 105), bar("2026-01-06", 110, 112, 100, 104, 2000)];
    const m = computeDailyMetrics(bars, { volumeWindow: 1 });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ date: "2026-01-06", prevClose: 105, prevDate: "2026-01-05" });
    expect(m[0].gapRate).toBeCloseTo((110 - 105) / 105, 10);
    expect(m[0].openToClose).toBeCloseTo((104 - 110) / 110, 10);
    expect(m[0].openToHigh).toBeCloseTo(2 / 110, 10);
    expect(m[0].openToLow).toBeCloseTo(-10 / 110, 10);
    expect(m[0].volumeRatio).toBe(2);
  });

  it("四本値が欠ける日は飛ばし、前日終値は直前の有効日を使う。並び順は日付昇順に正規化", () => {
    const bars = [
      bar("2026-01-07", 103, 105, 101, 102),
      bar("2026-01-06", 0, 0, 0, 0, 0, { open: null, high: null, low: null, close: null, adjOpen: null, adjHigh: null, adjLow: null, adjClose: null }),
      bar("2026-01-05", 100, 110, 95, 105),
    ];
    const m = computeDailyMetrics(bars);
    expect(m.map((x) => x.date)).toEqual(["2026-01-07"]);
    expect(m[0].prevDate).toBe("2026-01-05");
    expect(m[0].volumeRatio).toBeNull(); // 履歴不足
  });

  it("調整済み株価を優先する（分割をまたいでもギャップが暴れない）", () => {
    const bars = [
      bar("2026-01-05", 1000, 1000, 1000, 1000, 100, { adjOpen: 500, adjHigh: 500, adjLow: 500, adjClose: 500, adjFactor: 0.5 }),
      bar("2026-01-06", 505, 505, 505, 505, 100),
    ];
    const m = computeDailyMetrics(bars);
    expect(m[0].gapRate).toBeCloseTo(0.01, 10);
  });

  it("takeRecent", () => {
    const xs = [{ date: "a" }, { date: "b" }, { date: "c" }];
    expect(takeRecent(xs, 2).map((x) => x.date)).toEqual(["b", "c"]);
    expect(takeRecent(xs, null)).toHaveLength(3);
    expect(takeRecent(xs, 10)).toHaveLength(3);
  });
});

function metric(p: Partial<DailyMetric> & { date: string; gapRate: number; openToClose: number }): DailyMetric {
  return {
    code: "7203",
    source: "jquants",
    open: 100,
    high: 100 * (1 + Math.max(p.openToClose, 0) + 0.005),
    low: 100 * (1 + Math.min(p.openToClose, 0) - 0.005),
    close: 100 * (1 + p.openToClose),
    volume: 1,
    prevClose: 100 / (1 + p.gapRate),
    prevDate: "x",
    openToHigh: Math.max(p.openToClose, 0) + 0.005,
    openToLow: Math.min(p.openToClose, 0) - 0.005,
    volumeRatio: 1,
    ...p,
  };
}

describe("stats", () => {
  it("median / stdev / maxDrawdown", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(stdev([1])).toBeNull();
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(maxDrawdown([0.1, -0.05, -0.1, 0.2])).toBeCloseTo(0.15, 10);
    expect(maxDrawdown([0.1, 0.1])).toBe(0);
  });

  it("summarizeOpenToClose と条件別統計", () => {
    const ms = [
      metric({ date: "2026-01-05", gapRate: 0.02, openToClose: 0.01 }), // gap up, continuation
      metric({ date: "2026-01-06", gapRate: 0.02, openToClose: -0.02 }), // gap up, reversal
      metric({ date: "2026-01-07", gapRate: -0.02, openToClose: -0.01 }), // gap down, continuation
      metric({ date: "2026-01-08", gapRate: 0, openToClose: 0.03 }), // flat
    ];
    const s = summarizeOpenToClose(ms);
    expect(s.count).toBe(4);
    expect(s.winRate).toBe(0.5);
    expect(s.totalReturn).toBeCloseTo(0.01, 10);
    const dir = byGapDirection(ms);
    const up = dir.find((d) => d.key === "gap-up")!;
    expect(up.count).toBe(2);
    expect(up.winRate).toBe(0.5);
    expect(up.continuationRate).toBe(0.5);
    expect(up.reversalRate).toBe(0.5);
    const all = dir.find((d) => d.key === "all")!;
    expect(all.continuationRate).toBeCloseTo(2 / 3, 10);
    expect(dir.find((d) => d.key === "flat")!.continuationRate).toBeNull();
  });

  it("ギャップ区分", () => {
    expect(bucketOf(-0.05)?.key).toBe("le-3");
    expect(bucketOf(-0.03)?.key).toBe("-3to-1");
    expect(bucketOf(-0.01)?.key).toBe("-1to1");
    expect(bucketOf(0.0099)?.key).toBe("-1to1");
    expect(bucketOf(0.01)?.key).toBe("1to3");
    expect(bucketOf(0.03)?.key).toBe("ge3");
    const ms = [metric({ date: "a", gapRate: 0.05, openToClose: 0.01 }), metric({ date: "b", gapRate: 0.04, openToClose: -0.01 })];
    const b = byGapBucket(ms);
    expect(b.map((x) => x.count)).toEqual([0, 0, 0, 0, 2]);
    expect(b[4].winRate).toBe(0.5);
  });
});

describe("ranking", () => {
  it("summarizeStock / rankStocks（null は末尾）", () => {
    const a = summarizeStock("7203", "A", [metric({ date: "a", gapRate: 0.01, openToClose: 0.02 }), metric({ date: "b", gapRate: 0.01, openToClose: -0.01 })]);
    const b = summarizeStock("8306", "B", [metric({ date: "a", gapRate: 0.01, openToClose: 0.05 })]);
    const c = summarizeStock("9999", "C", []);
    expect(a.winRate).toBe(0.5);
    expect(a.avgRange).toBeCloseTo(((0.025 + 0.005) + (0.005 + 0.015)) / 2, 10);
    expect(rankStocks([a, b, c], "winRate").map((s) => s.code)).toEqual(["8306", "7203", "9999"]);
    expect(rankStocks([a, b, c], "avgOpenToClose", "asc").map((s) => s.code)).toEqual(["7203", "8306", "9999"]);
  });
});

describe("backtest", () => {
  const base = { code: "7203", date: "2026-01-05", source: "jquants" as const, volume: 1, prevClose: 100, prevDate: "x", volumeRatio: 1 };
  const m: DailyMetric = { ...base, open: 100, high: 103, low: 98, close: 101, gapRate: 0, openToClose: 0.01, openToHigh: 0.03, openToLow: -0.02 };

  it("引けまで保有", () => {
    const t = evaluateTrade(m, { side: "long" });
    expect(t).toMatchObject({ exitReason: "close", ret: 0.01, exit: 101 });
    expect(evaluateTrade(m, { side: "short" })).toMatchObject({ exitReason: "close", ret: -0.01 });
  });

  it("損切りのみ到達 / 利確のみ到達", () => {
    expect(evaluateTrade(m, { side: "long", stopLossPct: 0.015 })).toMatchObject({ exitReason: "stop", ret: -0.015 });
    expect(evaluateTrade(m, { side: "long", takeProfitPct: 0.025 })).toMatchObject({ exitReason: "take", ret: 0.025 });
    // ショート: 高値側が逆行
    expect(evaluateTrade(m, { side: "short", stopLossPct: 0.025 })).toMatchObject({ exitReason: "stop", ret: -0.025 });
    expect(evaluateTrade(m, { side: "short", takeProfitPct: 0.015 })).toMatchObject({ exitReason: "take", ret: 0.015 });
  });

  it("両方到達は判定不能（損益 null）", () => {
    const t = evaluateTrade(m, { side: "long", stopLossPct: 0.01, takeProfitPct: 0.02 });
    expect(t.exitReason).toBe("undetermined");
    expect(t.ret).toBeNull();
  });

  it("runBacktest: 条件フィルタ、日別累積、サマリー", () => {
    const ms = new Map<string, DailyMetric[]>([
      [
        "7203",
        [
          { ...m, date: "2026-01-05", gapRate: 0.02 },
          { ...m, date: "2026-01-06", gapRate: -0.02, openToClose: -0.03, close: 97, low: 96, openToLow: -0.04 },
          { ...m, date: "2026-01-07", gapRate: 0.05 },
        ],
      ],
      ["8306", [{ ...m, code: "8306", date: "2026-01-05", gapRate: 0.02, openToClose: 0.02, close: 102 }]],
    ]);
    const r = runBacktest(ms, { side: "long", gapMin: 0.01, gapMax: 0.04 });
    expect(r.trades.map((t) => `${t.code}:${t.date}`)).toEqual(["7203:2026-01-05", "8306:2026-01-05"]);
    expect(r.summary).toMatchObject({ trades: 2, determined: 2, undetermined: 0, wins: 2, winRate: 1 });
    expect(r.summary.totalReturn).toBeCloseTo(0.03, 10);
    expect(r.equity).toEqual([{ date: "2026-01-05", dailyReturn: expect.closeTo(0.03, 10), cumReturn: expect.closeTo(0.03, 10) }]);
    expect(r.summary.profitFactor).toBe(Infinity);

    const all = runBacktest(ms, { side: "long", stopLossPct: 0.01, takeProfitPct: 0.02 });
    expect(all.summary.undetermined).toBe(4); // 高値+3%・安値-2% 以上の日はすべて両方到達
    expect(all.summary.determined).toBe(0);
    expect(all.summary.winRate).toBeNull();
  });
});
