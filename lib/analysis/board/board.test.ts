import { describe, expect, it } from "vitest";
import type { BoardSnapshot, Trade } from "@/lib/db/types";
import { boardConditionTable } from "./conditional";
import { depthSummary, detectLargeOrders, thinLevels } from "./depth";
import { bucketStart, flowBuckets, ofiStep, sumFlow } from "./flow";
import { findOpen, isPreOpenSnapshot, postOpenSummary, preOpenSummary } from "./session";
import type { BoardDaySummary } from "./types";

function snap(ts: string, p: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    tradeDate: "2026-11-04",
    code: "7203",
    ts,
    currentPrice: 3000,
    currentPriceTime: ts,
    volume: 1000,
    vwap: null,
    bestAsk: 3001,
    bestAskQty: 500,
    bestAskSign: "0101",
    bestBid: 3000,
    bestBidQty: 700,
    bestBidSign: "0101",
    marketSellQty: 0,
    marketBuyQty: 0,
    overSellQty: null,
    underBuyQty: null,
    asks: [
      [3001, 500],
      [3002, 300],
      [3003, 200],
    ],
    bids: [
      [3000, 700],
      [2999, 100],
      [2998, 200],
    ],
    ...p,
  };
}
const trade = (ts: string, price: number, qty: number, side: Trade["side"] = "buy"): Trade => ({ tradeDate: "2026-11-04", code: "7203", seq: 0, ts, price, qty, side, origin: "push" });

describe("depth", () => {
  it("板の厚み・スプレッド・偏り", () => {
    const d = depthSummary(snap("t"), 5);
    expect(d.askQty).toBe(1000);
    expect(d.bidQty).toBe(1000);
    expect(d.spread).toBe(1);
    expect(d.mid).toBe(3000.5);
    expect(d.bidAskRatio).toBe(1);
    expect(d.imbalance).toBe(0);
    const d2 = depthSummary(snap("t", { bids: [[3000, 3000]] }), 1);
    expect(d2.bidAskRatio).toBe(6);
    expect(d2.imbalance).toBeCloseTo((3000 - 500) / 3500, 10);
  });
  it("大口の出現・消失と薄い段", () => {
    const prev = snap("t1");
    const cur = snap("t2", { asks: [[3001, 500], [3002, 5000], [3003, 200]] });
    const ev = detectLargeOrders(prev, cur, 5);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ side: "ask", price: 3002, kind: "appeared", qty: 4700 });
    const gone = detectLargeOrders(cur, prev, 5);
    expect(gone[0]).toMatchObject({ side: "ask", price: 3002, kind: "disappeared" });
    expect(thinLevels(snap("t", { bids: [[3000, 700], [2999, 10], [2998, 800]] }), 0.2)).toEqual([{ side: "bid", price: 2999, qty: 10, ratio: 10 / 700 }]);
  });
});

describe("flow / OFI", () => {
  it("bucketStart は JST で切り下げ", () => {
    expect(bucketStart("2026-11-04T09:03:40+09:00", 1)).toBe("2026-11-04T09:03:00+09:00");
    expect(bucketStart("2026-11-04T09:03:40+09:00", 5)).toBe("2026-11-04T09:00:00+09:00");
  });
  it("OFI: 買い気配の増加は正、売り気配の増加は負", () => {
    const a = snap("t1");
    expect(ofiStep(a, snap("t2", { bestBidQty: 900 }))).toBe(900 - 700); // 同値で数量増 → +q1 −q0
    expect(ofiStep(a, snap("t2", { bestAskQty: 800 }))).toBe(500 - 800); // 売り増 → +qa0 − qa1
    expect(ofiStep(a, snap("t2", { bestBid: 3001, bestBidQty: 100, bestAsk: 3002, bestAskQty: 50 }))).toBe(100 + 500); // 買い上がり: +qb1, +qa0
  });
  it("売買方向別の集計と圧力", () => {
    const trades = [trade("2026-11-04T09:00:10+09:00", 3001, 100, "buy"), trade("2026-11-04T09:00:20+09:00", 3000, 300, "sell"), trade("2026-11-04T09:01:05+09:00", 3002, 50, "unknown")];
    const snaps = [snap("2026-11-04T09:00:00+09:00"), snap("2026-11-04T09:00:30+09:00", { bestBidQty: 1700 })];
    const b = flowBuckets(trades, snaps, 1);
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ ts: "2026-11-04T09:00:00+09:00", buyQty: 100, sellQty: 300, trades: 2, ofi: 1000 });
    expect(b[0].pressure).toBeCloseTo(-0.5, 10);
    expect(b[1]).toMatchObject({ unknownQty: 50, pressure: null });
    expect(sumFlow(b, "2026-11-04T09:00:00+09:00", "2026-11-04T09:01:00+09:00")).toMatchObject({ buyQty: 100, sellQty: 300, ofi: 1000 });
  });
});

describe("session (pre/post open)", () => {
  const pre1 = snap("2026-11-04T08:30:00+09:00", { currentPrice: null, volume: null, bestAsk: 3010, bestBid: 3010, bestAskSign: "0107", bestBidSign: "0107", asks: [[3010, 1000]], bids: [[3010, 3000]], marketBuyQty: 5000, marketSellQty: 1000 });
  const pre2 = snap("2026-11-04T08:59:50+09:00", { currentPrice: null, volume: null, bestAsk: 3020, bestBid: 3020, bestAskSign: "0107", bestBidSign: "0107", asks: [[3020, 2000]], bids: [[3020, 3000]], marketBuyQty: 6000, marketSellQty: 1000 });
  const openSnap = snap("2026-11-04T09:00:01+09:00", { currentPrice: 3030, volume: 20000 });
  const trades = [
    trade("2026-11-04T09:00:01+09:00", 3030, 20000, "unknown"),
    trade("2026-11-04T09:00:40+09:00", 3040, 100, "buy"),
    trade("2026-11-04T09:01:30+09:00", 3045, 100, "buy"),
    trade("2026-11-04T09:05:10+09:00", 3000, 100, "sell"),
    trade("2026-11-04T09:16:00+09:00", 3060, 100, "buy"),
  ];
  it("寄り前の推移と寄り直前の偏り・始値乖離", () => {
    expect(isPreOpenSnapshot(pre1)).toBe(true);
    expect(isPreOpenSnapshot(openSnap)).toBe(false);
    const p = preOpenSummary([pre1, pre2, openSnap], trades, 5);
    expect(p.points).toHaveLength(2);
    expect(p.lastIndicative).toBe(3020);
    expect(p.lastImbalance).toBeCloseTo((3000 - 2000) / 5000, 10);
    expect(p.lastMarketBalance).toBeCloseTo((6000 - 1000) / 7000, 10);
    expect(p.openPrice).toBe(3030);
    expect(p.deviationFromOpen).toBeCloseTo((3030 - 3020) / 3020, 10);
  });
  it("寄り後の値動き（1分・5分・15分）とデータ不足の null", () => {
    expect(findOpen(trades, [])).toEqual({ price: 3030, ts: "2026-11-04T09:00:01+09:00" });
    const s = postOpenSummary([pre2, openSnap], trades);
    expect(s.openPrice).toBe(3030);
    expect(s.move1m).toBeCloseTo((3040 - 3030) / 3030, 10);
    expect(s.move5m).toBeCloseTo((3045 - 3030) / 3030, 10);
    expect(s.move15m).toBeCloseTo((3000 - 3030) / 3030, 10);
    expect(s.move30m).toBeNull();
    expect(s.pressure5m).toBeCloseTo((200 - 0) / 200, 10);
  });
});

describe("conditional", () => {
  it("条件別の件数と信頼度フラグ", () => {
    const day = (imb: number, ofi: number, m5: number): BoardDaySummary => ({
      code: "7203",
      tradeDate: "d",
      preOpen: { points: [], lastIndicative: 100, lastImbalance: imb, lastMarketBalance: null, openPrice: 100, deviationFromOpen: 0 },
      postOpen: { openPrice: 100, openTs: "t", move1m: null, move5m: m5, move15m: null, move30m: null, ofi1m: ofi, ofi5m: null, pressure5m: null },
      moveToClose: m5 * 2,
    });
    const t = boardConditionTable([day(0.5, 10, 0.01), day(-0.5, -10, -0.02), day(0.1, 5, 0.03)]);
    const all = t.find((x) => x.key === "all")!;
    expect(all.count).toBe(3);
    expect(all.reliable).toBe(false);
    expect(all.upRate5m).toBeCloseTo(2 / 3, 10);
    expect(t.find((x) => x.key === "pre-bid")!.count).toBe(1);
    expect(t.find((x) => x.key === "pre-ask")!.avgMove5m).toBeCloseTo(-0.02, 10);
    expect(t.find((x) => x.key === "ofi-pos")!.count).toBe(2);
    expect(t.find((x) => x.key === "pre-flat")!.count).toBe(1);
  });
});
