import type { BoardSnapshot, FlowBucket, Trade } from "./types";

const JST_MS = 9 * 60 * 60 * 1000;

/** ISO（オフセット付き）→ JST のバケット開始 ISO */
export function bucketStart(iso: string, minutes: number): string {
  const j = new Date(new Date(iso).getTime() + JST_MS);
  const total = j.getUTCHours() * 60 + j.getUTCMinutes();
  const f = Math.floor(total / minutes) * minutes;
  return `${j.toISOString().slice(0, 10)}T${String(Math.floor(f / 60)).padStart(2, "0")}:${String(f % 60).padStart(2, "0")}:00+09:00`;
}

/**
 * オーダーフローインバランス（Cont, Kukanov, Stoikov 2014）。
 * 最良気配の変化から: e = ΔBid寄与 − ΔAsk寄与
 *   bid: P_b >= P_b(prev) なら +q_b、P_b <= P_b(prev) なら −q_b(prev)
 *   ask: P_a <= P_a(prev) なら −q_a、P_a >= P_a(prev) なら +q_a(prev)
 */
export function ofiStep(prev: BoardSnapshot, cur: BoardSnapshot): number {
  const pb0 = prev.bestBid;
  const pb1 = cur.bestBid;
  const qb0 = prev.bestBidQty ?? 0;
  const qb1 = cur.bestBidQty ?? 0;
  const pa0 = prev.bestAsk;
  const pa1 = cur.bestAsk;
  const qa0 = prev.bestAskQty ?? 0;
  const qa1 = cur.bestAskQty ?? 0;
  if (pb0 === null || pb1 === null || pa0 === null || pa1 === null) return 0;
  let e = 0;
  if (pb1 >= pb0) e += qb1;
  if (pb1 <= pb0) e -= qb0;
  if (pa1 <= pa0) e -= qa1;
  if (pa1 >= pa0) e += qa0;
  return e;
}

/** 約定を売買方向別に時間バケットへ集計し、同じバケットの OFI を加える */
export function flowBuckets(trades: readonly Trade[], snapshots: readonly BoardSnapshot[], minutes = 1): FlowBucket[] {
  const map = new Map<string, FlowBucket>();
  const get = (ts: string) => {
    const k = bucketStart(ts, minutes);
    let b = map.get(k);
    if (!b) {
      b = { ts: k, buyQty: 0, sellQty: 0, unknownQty: 0, trades: 0, pressure: null, ofi: 0, lastPrice: null };
      map.set(k, b);
    }
    return b;
  };
  for (const t of trades) {
    const b = get(t.ts);
    b.trades++;
    if (t.side === "buy") b.buyQty += t.qty;
    else if (t.side === "sell") b.sellQty += t.qty;
    else b.unknownQty += t.qty;
    b.lastPrice = t.price;
  }
  for (let i = 1; i < snapshots.length; i++) {
    const b = get(snapshots[i].ts);
    b.ofi += ofiStep(snapshots[i - 1], snapshots[i]);
    if (snapshots[i].currentPrice !== null && b.lastPrice === null) b.lastPrice = snapshots[i].currentPrice;
  }
  const out = [...map.values()].sort((a, b) => (a.ts < b.ts ? -1 : 1));
  for (const b of out) b.pressure = b.buyQty + b.sellQty > 0 ? (b.buyQty - b.sellQty) / (b.buyQty + b.sellQty) : null;
  return out;
}

/** 期間内の合計 */
export function sumFlow(buckets: readonly FlowBucket[], from: string, toExclusive: string): { buyQty: number; sellQty: number; ofi: number; pressure: number | null } {
  let buy = 0;
  let sell = 0;
  let ofi = 0;
  for (const b of buckets) {
    if (b.ts >= from && b.ts < toExclusive) {
      buy += b.buyQty;
      sell += b.sellQty;
      ofi += b.ofi;
    }
  }
  return { buyQty: buy, sellQty: sell, ofi, pressure: buy + sell > 0 ? (buy - sell) / (buy + sell) : null };
}
