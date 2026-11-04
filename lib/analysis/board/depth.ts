import type { BoardSnapshot, DepthSummary, LargeOrderEvent, ThinLevel } from "./types";

export function sumQty(levels: [number, number][], n: number): number {
  return levels.slice(0, n).reduce((s, [, q]) => s + q, 0);
}

/** 板の厚みとスプレッド */
export function depthSummary(s: BoardSnapshot, topN = 5): DepthSummary {
  const askQty = sumQty(s.asks, topN);
  const bidQty = sumQty(s.bids, topN);
  const bestAsk = s.bestAsk ?? s.asks[0]?.[0] ?? null;
  const bestBid = s.bestBid ?? s.bids[0]?.[0] ?? null;
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;
  const mid = bestAsk !== null && bestBid !== null ? (bestAsk + bestBid) / 2 : null;
  return {
    ts: s.ts,
    bestAsk,
    bestBid,
    spread,
    spreadPct: spread !== null && mid ? spread / mid : null,
    mid,
    askQty,
    bidQty,
    bidAskRatio: askQty > 0 ? bidQty / askQty : null,
    imbalance: askQty + bidQty > 0 ? (bidQty - askQty) / (bidQty + askQty) : 0,
    marketBuyQty: s.marketBuyQty,
    marketSellQty: s.marketSellQty,
  };
}

export function depthSeries(snapshots: readonly BoardSnapshot[], topN = 5): DepthSummary[] {
  return snapshots.map((s) => depthSummary(s, topN));
}

function medianQty(levels: [number, number][]): number {
  const q = levels.map(([, v]) => v).sort((a, b) => a - b);
  if (q.length === 0) return 0;
  const mid = Math.floor(q.length / 2);
  return q.length % 2 ? q[mid] : (q[mid - 1] + q[mid]) / 2;
}

/**
 * 大口注文の出現・消失。前後のスナップショットで同一価格の数量が中央値の threshold 倍以上
 * 増えた／減った場合をイベントとする。
 */
export function detectLargeOrders(prev: BoardSnapshot, cur: BoardSnapshot, threshold = 5): LargeOrderEvent[] {
  const out: LargeOrderEvent[] = [];
  for (const side of ["ask", "bid"] as const) {
    const p = new Map(prev[side === "ask" ? "asks" : "bids"]);
    const c = new Map(cur[side === "ask" ? "asks" : "bids"]);
    const med = medianQty([...prev[side === "ask" ? "asks" : "bids"], ...cur[side === "ask" ? "asks" : "bids"]]);
    if (med <= 0) continue;
    const prices = new Set([...p.keys(), ...c.keys()]);
    for (const price of prices) {
      const before = p.get(price) ?? 0;
      const after = c.get(price) ?? 0;
      const delta = after - before;
      if (delta >= med * threshold) out.push({ ts: cur.ts, side, price, qty: delta, kind: "appeared", ratio: delta / med });
      else if (-delta >= med * threshold && after < med) out.push({ ts: cur.ts, side, price, qty: -delta, kind: "disappeared", ratio: -delta / med });
    }
  }
  return out;
}

export function largeOrderEvents(snapshots: readonly BoardSnapshot[], threshold = 5): LargeOrderEvent[] {
  const out: LargeOrderEvent[] = [];
  for (let i = 1; i < snapshots.length; i++) out.push(...detectLargeOrders(snapshots[i - 1], snapshots[i], threshold));
  return out;
}

/** 気配の薄い価格帯（数量が中央値の ratio 倍未満の段） */
export function thinLevels(s: BoardSnapshot, ratio = 0.2): ThinLevel[] {
  const out: ThinLevel[] = [];
  for (const side of ["ask", "bid"] as const) {
    const levels = side === "ask" ? s.asks : s.bids;
    const med = medianQty(levels);
    if (med <= 0) continue;
    for (const [price, qty] of levels) if (qty < med * ratio) out.push({ side, price, qty, ratio: qty / med });
  }
  return out;
}
