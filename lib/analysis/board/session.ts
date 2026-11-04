import { depthSummary } from "./depth";
import { flowBuckets, sumFlow } from "./flow";
import type { BoardSnapshot, PostOpenSummary, PreOpenPoint, PreOpenSummary, Trade } from "./types";

/** 寄前気配を示す気配種別（kabu） */
export const PRE_OPEN_SIGNS = new Set(["0107", "0116", "0117"]);

export function isPreOpenSnapshot(s: BoardSnapshot): boolean {
  if (s.currentPrice !== null && (s.volume ?? 0) > 0) return false;
  return PRE_OPEN_SIGNS.has(s.bestAskSign ?? "") || PRE_OPEN_SIGNS.has(s.bestBidSign ?? "") || s.currentPrice === null;
}

/** 始値（最初の約定）。約定が無ければ最初に現在値が付いたスナップショット */
export function findOpen(trades: readonly Trade[], snapshots: readonly BoardSnapshot[]): { price: number; ts: string } | null {
  if (trades.length > 0) return { price: trades[0].price, ts: trades[0].ts };
  const s = snapshots.find((x) => x.currentPrice !== null && (x.volume ?? 0) > 0);
  return s && s.currentPrice !== null ? { price: s.currentPrice, ts: s.currentPriceTime ?? s.ts } : null;
}

/** 寄り前（8:00〜寄り付き）の気配推移と、寄り直前の状態 */
export function preOpenSummary(snapshots: readonly BoardSnapshot[], trades: readonly Trade[], topN = 5): PreOpenSummary {
  const open = findOpen(trades, snapshots);
  const pre = snapshots.filter((s) => (open ? s.ts < open.ts : true) && isPreOpenSnapshot(s));
  const points: PreOpenPoint[] = pre.map((s) => {
    const d = depthSummary(s, topN);
    // 寄前気配は売り買いが同値で表示されることが多いので、中値が指標になる
    const indicative = d.mid ?? d.bestAsk ?? d.bestBid;
    return { ts: s.ts, indicative, askQty: d.askQty, bidQty: d.bidQty, imbalance: d.imbalance, marketBuyQty: s.marketBuyQty, marketSellQty: s.marketSellQty };
  });
  const last = points[points.length - 1] ?? null;
  const mb = last?.marketBuyQty ?? null;
  const ms = last?.marketSellQty ?? null;
  const marketBalance = mb !== null && ms !== null && mb + ms > 0 ? (mb - ms) / (mb + ms) : null;
  return {
    points,
    lastIndicative: last?.indicative ?? null,
    lastImbalance: last?.imbalance ?? null,
    lastMarketBalance: marketBalance,
    openPrice: open?.price ?? null,
    deviationFromOpen: last?.indicative && open ? (open.price - last.indicative) / last.indicative : null,
  };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** 時刻 t 以降で最初の約定価格 */
function priceAtOrAfter(trades: readonly Trade[], isoUtc: string): number | null {
  const target = new Date(isoUtc).getTime();
  let last: number | null = null;
  for (const t of trades) {
    const tt = new Date(t.ts).getTime();
    if (tt <= target) last = t.price;
    else break;
  }
  return last;
}

/** 寄り後の値動きと直後の約定フロー */
export function postOpenSummary(snapshots: readonly BoardSnapshot[], trades: readonly Trade[]): PostOpenSummary {
  const open = findOpen(trades, snapshots);
  if (!open) return { openPrice: null, openTs: null, move1m: null, move5m: null, move15m: null, move30m: null, ofi1m: null, ofi5m: null, pressure5m: null };
  const lastTradeMs = trades.length ? new Date(trades[trades.length - 1].ts).getTime() : 0;
  const move = (min: number): number | null => {
    const at = addMinutes(open.ts, min);
    if (new Date(at).getTime() > lastTradeMs) return null; // データが足りない
    const p = priceAtOrAfter(trades, at);
    return p === null ? null : (p - open.price) / open.price;
  };
  const buckets = flowBuckets(trades, snapshots, 1);
  const openBucket = buckets.find((b) => new Date(b.ts).getTime() <= new Date(open.ts).getTime() && new Date(open.ts).getTime() < new Date(b.ts).getTime() + 60_000);
  const from = openBucket?.ts ?? buckets[0]?.ts ?? open.ts;
  const f1 = sumFlow(buckets, from, toJstIso(addMinutes(from, 1)));
  const f5 = sumFlow(buckets, from, toJstIso(addMinutes(from, 5)));
  return {
    openPrice: open.price,
    openTs: open.ts,
    move1m: move(1),
    move5m: move(5),
    move15m: move(15),
    move30m: move(30),
    ofi1m: buckets.length ? f1.ofi : null,
    ofi5m: buckets.length ? f5.ofi : null,
    pressure5m: f5.pressure,
  };
}

function toJstIso(isoUtc: string): string {
  const j = new Date(new Date(isoUtc).getTime() + 9 * 3600_000);
  return `${j.toISOString().slice(0, 19)}+09:00`;
}
