import type { DailyBar } from "@/lib/db/types";
import type { NormalizedBoard } from "./provider";

/**
 * 大引け後の板（REST /board）から自前の日足（出所 kabu）を作る。
 * 四本値のどれかが欠けていれば null（部分的な日足は保存しない）。
 */
export function boardToDailyBar(b: NormalizedBoard, tradeDate: string, fetchedAt: string): DailyBar | null {
  if (b.openingPrice === null || b.highPrice === null || b.lowPrice === null || b.currentPrice === null) return null;
  return {
    code: b.code,
    date: tradeDate,
    source: "kabu",
    open: b.openingPrice,
    high: b.highPrice,
    low: b.lowPrice,
    close: b.currentPrice,
    volume: b.tradingVolume,
    turnover: b.tradingValue,
    adjFactor: 1,
    adjOpen: b.openingPrice,
    adjHigh: b.highPrice,
    adjLow: b.lowPrice,
    adjClose: b.currentPrice,
    adjVolume: b.tradingVolume,
    upperLimit: null,
    lowerLimit: null,
    fetchedAt,
  };
}
