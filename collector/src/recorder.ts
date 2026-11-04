import type { BoardSnapshot, MinuteBar, Trade, TradeSide } from "@/lib/db/types";
import type { NormalizedBoard } from "./provider";
import { floorToMinutes } from "./time";

/**
 * 記録ロジック（純粋関数）。
 * - 板スナップショット: 変化があったときだけ、かつ最小間隔（intervalMs）を空けて保存
 * - 約定: PUSH の累計出来高の差分から復元（PUSH は 400ms 間引きのため、複数約定が1件にまとまることがある）
 * - 分足: 復元した約定から 1分・5分足を集計
 */

export interface SnapshotPolicy {
  /** 最小保存間隔（ms）。0 なら変化のたびに保存 */
  intervalMs: number;
  /** 保存する板の深さ */
  depth: number;
}

function levelsEqual(a: NormalizedBoard["asks"], b: NormalizedBoard["asks"], depth: number): boolean {
  for (let i = 0; i < depth; i++) {
    const x = a[i];
    const y = b[i];
    if ((x?.price ?? null) !== (y?.price ?? null) || (x?.qty ?? null) !== (y?.qty ?? null)) return false;
  }
  return true;
}

/** 板・時価に変化があるか（保存に値する差分か） */
export function boardChanged(prev: NormalizedBoard | null, cur: NormalizedBoard, depth: number): boolean {
  if (!prev) return true;
  if (prev.currentPrice !== cur.currentPrice || prev.tradingVolume !== cur.tradingVolume) return true;
  if (prev.bestAsk.price !== cur.bestAsk.price || prev.bestAsk.qty !== cur.bestAsk.qty) return true;
  if (prev.bestBid.price !== cur.bestBid.price || prev.bestBid.qty !== cur.bestBid.qty) return true;
  if (prev.marketBuyQty !== cur.marketBuyQty || prev.marketSellQty !== cur.marketSellQty) return true;
  if (prev.overSellQty !== cur.overSellQty || prev.underBuyQty !== cur.underBuyQty) return true;
  return !levelsEqual(prev.asks, cur.asks, depth) || !levelsEqual(prev.bids, cur.bids, depth);
}

export function shouldSnapshot(prev: NormalizedBoard | null, cur: NormalizedBoard, policy: SnapshotPolicy, lastSavedAtMs: number | null, nowMs: number): boolean {
  if (!boardChanged(prev, cur, policy.depth)) return false;
  if (policy.intervalMs <= 0 || lastSavedAtMs === null) return true;
  return nowMs - lastSavedAtMs >= policy.intervalMs;
}

export function toSnapshot(b: NormalizedBoard, tradeDate: string, depth: number): BoardSnapshot {
  const lv = (levels: NormalizedBoard["asks"]): [number, number][] =>
    levels
      .slice(0, depth)
      .filter((l) => l.price !== null && l.qty !== null)
      .map((l) => [l.price!, l.qty!]);
  return {
    tradeDate,
    code: b.code,
    ts: b.receivedAt,
    currentPrice: b.currentPrice,
    currentPriceTime: b.currentPriceTime,
    volume: b.tradingVolume,
    vwap: b.vwap,
    bestAsk: b.bestAsk.price,
    bestAskQty: b.bestAsk.qty,
    bestAskSign: b.bestAsk.sign,
    bestBid: b.bestBid.price,
    bestBidQty: b.bestBid.qty,
    bestBidSign: b.bestBid.sign,
    marketSellQty: b.marketSellQty,
    marketBuyQty: b.marketBuyQty,
    overSellQty: b.overSellQty,
    underBuyQty: b.underBuyQty,
    asks: lv(b.asks),
    bids: lv(b.bids),
  };
}

/** 約定価格と直前の最良気配から売買方向を判定する（最良売り以上 = 買い、最良買い以下 = 売り） */
export function classifySide(price: number, prevBestAsk: number | null, prevBestBid: number | null): TradeSide {
  if (prevBestAsk !== null && price >= prevBestAsk) return "buy";
  if (prevBestBid !== null && price <= prevBestBid) return "sell";
  return "unknown";
}

/**
 * 直前の板と現在の板から約定を復元する。
 * 累計出来高が増えていれば、その差分を現在値で1件の約定とみなす。
 * 寄り付き（直前の出来高が 0/null）は板寄せ約定なので方向は unknown。
 */
export function reconstructTrades(prev: NormalizedBoard | null, cur: NormalizedBoard, tradeDate: string, seqStart: number): Trade[] {
  if (cur.tradingVolume === null || cur.currentPrice === null) return [];
  if (!prev) return [];
  // 直前が寄り前（出来高 null）なら 0 とみなし、最初の約定（板寄せ）を拾う
  const prevVol = prev.tradingVolume ?? 0;
  const dv = cur.tradingVolume - prevVol;
  if (dv <= 0) return [];
  const side: TradeSide = prevVol === 0 ? "unknown" : classifySide(cur.currentPrice, prev?.bestAsk.price ?? null, prev?.bestBid.price ?? null);
  return [
    {
      tradeDate,
      code: cur.code,
      seq: seqStart,
      ts: cur.currentPriceTime ?? cur.receivedAt,
      price: cur.currentPrice,
      qty: dv,
      side,
      origin: "push",
    },
  ];
}

/** 約定から 1分足・5分足を集計する（メモリ上。flush で upsert 用の配列を返す） */
export class MinuteAggregator {
  private bars = new Map<string, MinuteBar>();
  private dirty = new Set<string>();

  constructor(private readonly source: MinuteBar["source"] = "kabu") {}

  add(trade: Trade): void {
    for (const interval of [1, 5] as const) {
      const ts = floorToMinutes(trade.ts, interval);
      const key = `${trade.code}|${trade.tradeDate}|${interval}|${ts}`;
      const cur = this.bars.get(key);
      if (!cur) {
        this.bars.set(key, {
          code: trade.code,
          tradeDate: trade.tradeDate,
          intervalMin: interval,
          ts,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volume: trade.qty,
          source: this.source,
        });
      } else {
        cur.high = Math.max(cur.high ?? trade.price, trade.price);
        cur.low = Math.min(cur.low ?? trade.price, trade.price);
        cur.close = trade.price;
        cur.volume = (cur.volume ?? 0) + trade.qty;
      }
      this.dirty.add(key);
    }
  }

  /** 変更のあったバーを返し、dirty をクリアする */
  flush(): MinuteBar[] {
    const out: MinuteBar[] = [];
    for (const k of this.dirty) {
      const b = this.bars.get(k);
      if (b) out.push({ ...b });
    }
    this.dirty.clear();
    return out;
  }

  get size(): number {
    return this.bars.size;
  }
}
