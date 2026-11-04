import { describe, expect, it } from "vitest";
import type { NormalizedBoard } from "./provider";
import { boardChanged, classifySide, MinuteAggregator, reconstructTrades, shouldSnapshot, toSnapshot } from "./recorder";

function board(p: Partial<NormalizedBoard> = {}): NormalizedBoard {
  return {
    code: "7203",
    exchange: 1,
    receivedAt: "2026-11-04T09:00:00.000+09:00",
    currentPrice: 3000,
    currentPriceTime: "2026-11-04T09:00:00+09:00",
    currentPriceChangeStatus: null,
    calcPrice: 3000,
    previousClose: 2950,
    openingPrice: 2990,
    highPrice: 3010,
    lowPrice: 2985,
    tradingVolume: 1000,
    tradingValue: null,
    vwap: null,
    bestAsk: { price: 3001, qty: 500, sign: "0101", time: null },
    bestBid: { price: 3000, qty: 700, sign: "0101", time: null },
    asks: [
      { price: 3001, qty: 500 },
      { price: 3002, qty: 300 },
    ],
    bids: [
      { price: 3000, qty: 700 },
      { price: 2999, qty: 100 },
    ],
    marketSellQty: 0,
    marketBuyQty: 0,
    overSellQty: 1,
    underBuyQty: 1,
    totalMarketValue: null,
    ...p,
  };
}

describe("snapshot policy", () => {
  it("変化がなければ保存しない", () => {
    const a = board();
    expect(boardChanged(null, a, 10)).toBe(true);
    expect(boardChanged(a, board(), 10)).toBe(false);
    expect(boardChanged(a, board({ asks: [{ price: 3001, qty: 400 }] }), 10)).toBe(true);
    expect(boardChanged(a, board({ tradingVolume: 1100 }), 10)).toBe(true);
  });
  it("最小間隔を守る", () => {
    const a = board();
    const b = board({ tradingVolume: 1100 });
    expect(shouldSnapshot(a, b, { intervalMs: 1000, depth: 10 }, 10_000, 10_500)).toBe(false);
    expect(shouldSnapshot(a, b, { intervalMs: 1000, depth: 10 }, 10_000, 11_000)).toBe(true);
    expect(shouldSnapshot(a, b, { intervalMs: 0, depth: 10 }, 10_000, 10_001)).toBe(true);
    expect(shouldSnapshot(a, b, { intervalMs: 1000, depth: 10 }, null, 0)).toBe(true);
  });
  it("toSnapshot は上位 depth 本だけ、null 段は除く", () => {
    const s = toSnapshot(board({ asks: [{ price: 3001, qty: 500 }, { price: null, qty: null }, { price: 3003, qty: 1 }] }), "2026-11-04", 2);
    expect(s.asks).toEqual([[3001, 500]]);
    expect(s.bids).toEqual([
      [3000, 700],
      [2999, 100],
    ]);
    expect(s).toMatchObject({ tradeDate: "2026-11-04", code: "7203", bestAsk: 3001, bestBid: 3000, volume: 1000 });
  });
});

describe("trade reconstruction", () => {
  it("売買方向: 最良売り以上は買い、最良買い以下は売り、間は不明", () => {
    expect(classifySide(3001, 3001, 3000)).toBe("buy");
    expect(classifySide(3000, 3001, 3000)).toBe("sell");
    expect(classifySide(3000.5, 3001, 3000)).toBe("unknown");
    expect(classifySide(3000, null, null)).toBe("unknown");
  });
  it("出来高差分を1件の約定にし、直前の気配で方向を決める", () => {
    const prev = board({ tradingVolume: 1000 });
    const cur = board({ tradingVolume: 1300, currentPrice: 3001, currentPriceTime: "2026-11-04T09:00:01+09:00", receivedAt: "2026-11-04T09:00:01.200+09:00" });
    const t = reconstructTrades(prev, cur, "2026-11-04", 5);
    expect(t).toEqual([{ tradeDate: "2026-11-04", code: "7203", seq: 5, ts: "2026-11-04T09:00:01+09:00", price: 3001, qty: 300, side: "buy", origin: "push" }]);
  });
  it("出来高が増えていない・直前が無い・現在値が無い場合は約定なし。寄り付きは unknown", () => {
    expect(reconstructTrades(null, board(), "d", 1)).toEqual([]);
    expect(reconstructTrades(board(), board(), "d", 1)).toEqual([]);
    expect(reconstructTrades(board({ tradingVolume: 0 }), board({ tradingVolume: 5000, currentPrice: null }), "d", 1)).toEqual([]);
    const open = reconstructTrades(board({ tradingVolume: 0 }), board({ tradingVolume: 5000 }), "d", 1);
    expect(open[0]).toMatchObject({ qty: 5000, side: "unknown" });
    // 直前が寄り前（出来高 null）でも板寄せ約定を拾う
    const fromPre = reconstructTrades(board({ tradingVolume: null, currentPrice: null }), board({ tradingVolume: 7000 }), "d", 1);
    expect(fromPre[0]).toMatchObject({ qty: 7000, side: "unknown" });
  });
});

describe("MinuteAggregator", () => {
  it("1分足と5分足を同時に集計し、flush は変更分だけ返す", () => {
    const agg = new MinuteAggregator();
    const t = (ts: string, price: number, qty: number) => ({ tradeDate: "2026-11-04", code: "7203", seq: 1, ts, price, qty, side: "buy" as const, origin: "push" as const });
    agg.add(t("2026-11-04T09:00:10+09:00", 100, 10));
    agg.add(t("2026-11-04T09:00:50+09:00", 102, 5));
    agg.add(t("2026-11-04T09:01:05+09:00", 99, 7));
    const bars = agg.flush();
    const one = bars.filter((b) => b.intervalMin === 1).sort((a, b) => (a.ts < b.ts ? -1 : 1));
    expect(one.map((b) => [b.ts, b.open, b.high, b.low, b.close, b.volume])).toEqual([
      ["2026-11-04T09:00:00+09:00", 100, 102, 100, 102, 15],
      ["2026-11-04T09:01:00+09:00", 99, 99, 99, 99, 7],
    ]);
    const five = bars.filter((b) => b.intervalMin === 5);
    expect(five).toHaveLength(1);
    expect(five[0]).toMatchObject({ ts: "2026-11-04T09:00:00+09:00", open: 100, high: 102, low: 99, close: 99, volume: 22 });
    expect(agg.flush()).toEqual([]);
    agg.add(t("2026-11-04T09:01:30+09:00", 101, 1));
    expect(agg.flush()).toHaveLength(2);
  });
});
