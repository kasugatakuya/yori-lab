import { conditionalStats, mean } from "./stats";
import type { DailyMetric } from "./types";

export interface StockSummary {
  code: string;
  name: string;
  count: number;
  winRate: number | null;
  avgOpenToClose: number | null;
  medianOpenToClose: number | null;
  totalReturn: number;
  maxDrawdown: number;
  avgGapRate: number | null;
  /** ギャップ後の継続率・反転率 */
  continuationRate: number | null;
  reversalRate: number | null;
  /** 寄りからの平均値幅（高値率 − 安値率） */
  avgRange: number | null;
  avgVolumeRatio: number | null;
  firstDate: string | null;
  lastDate: string | null;
}

export type RankingKey = keyof Pick<
  StockSummary,
  "winRate" | "avgOpenToClose" | "medianOpenToClose" | "totalReturn" | "maxDrawdown" | "continuationRate" | "reversalRate" | "avgRange" | "avgGapRate" | "count"
>;

export function summarizeStock(code: string, name: string, metrics: readonly DailyMetric[]): StockSummary {
  const c = conditionalStats(code, name, metrics);
  return {
    code,
    name,
    count: c.count,
    winRate: c.winRate,
    avgOpenToClose: c.avgReturn,
    medianOpenToClose: c.medianReturn,
    totalReturn: c.totalReturn,
    maxDrawdown: c.maxDrawdown,
    avgGapRate: c.avgGapRate,
    continuationRate: c.continuationRate,
    reversalRate: c.reversalRate,
    avgRange: mean(metrics.map((m) => m.openToHigh - m.openToLow)),
    avgVolumeRatio: mean(metrics.flatMap((m) => (m.volumeRatio === null ? [] : [m.volumeRatio]))),
    firstDate: metrics[0]?.date ?? null,
    lastDate: metrics[metrics.length - 1]?.date ?? null,
  };
}

/** 指定キーで並べ替え（null は末尾） */
export function rankStocks(summaries: readonly StockSummary[], key: RankingKey, direction: "desc" | "asc" = "desc"): StockSummary[] {
  const sign = direction === "desc" ? -1 : 1;
  return [...summaries].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return a.code < b.code ? -1 : 1;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return a.code < b.code ? -1 : 1;
    return av < bv ? -sign : sign;
  });
}
