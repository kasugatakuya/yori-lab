import type { ConditionalStats, DailyMetric, GapBucket, StrategyStats } from "./types";

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

/** 累積損益率の系列から最大ドローダウン（ピークからの最大下落幅）を求める */
export function maxDrawdown(returns: readonly number[]): number {
  let cum = 0;
  let peak = 0;
  let mdd = 0;
  for (const r of returns) {
    cum += r;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

/** 寄り買い・引け売り（1単位ずつ毎日）の成績。returns は日付順 */
export function strategyStats(returns: readonly number[]): StrategyStats {
  const wins = returns.filter((r) => r > 0).length;
  return {
    count: returns.length,
    winRate: returns.length ? wins / returns.length : null,
    avgReturn: mean(returns),
    medianReturn: median(returns),
    stdevReturn: stdev(returns),
    totalReturn: returns.reduce((s, r) => s + r, 0),
    maxDrawdown: maxDrawdown(returns),
  };
}

export function summarizeOpenToClose(metrics: readonly DailyMetric[]): StrategyStats {
  return strategyStats(metrics.map((m) => m.openToClose));
}

export function conditionalStats(key: string, label: string, metrics: readonly DailyMetric[]): ConditionalStats {
  const base = summarizeOpenToClose(metrics);
  const gapped = metrics.filter((m) => m.gapRate !== 0);
  const cont = gapped.filter((m) => Math.sign(m.openToClose) === Math.sign(m.gapRate)).length;
  const rev = gapped.filter((m) => m.openToClose !== 0 && Math.sign(m.openToClose) === -Math.sign(m.gapRate)).length;
  return {
    key,
    label,
    ...base,
    avgGapRate: mean(metrics.map((m) => m.gapRate)),
    avgOpenToHigh: mean(metrics.map((m) => m.openToHigh)),
    avgOpenToLow: mean(metrics.map((m) => m.openToLow)),
    continuationRate: gapped.length ? cont / gapped.length : null,
    reversalRate: gapped.length ? rev / gapped.length : null,
  };
}

/** ギャップアップ / ギャップダウン / 変わらず の条件別統計 */
export function byGapDirection(metrics: readonly DailyMetric[]): ConditionalStats[] {
  return [
    conditionalStats("all", "全日", metrics),
    conditionalStats("gap-up", "ギャップアップ（始値 > 前日終値）", metrics.filter((m) => m.gapRate > 0)),
    conditionalStats("gap-down", "ギャップダウン（始値 < 前日終値）", metrics.filter((m) => m.gapRate < 0)),
    conditionalStats("flat", "変わらず", metrics.filter((m) => m.gapRate === 0)),
  ];
}

export const GAP_BUCKETS: readonly GapBucket[] = [
  { key: "le-3", label: "-3%以下", min: null, max: -0.03 },
  { key: "-3to-1", label: "-3%〜-1%", min: -0.03, max: -0.01 },
  { key: "-1to1", label: "-1%〜1%", min: -0.01, max: 0.01 },
  { key: "1to3", label: "1%〜3%", min: 0.01, max: 0.03 },
  { key: "ge3", label: "3%以上", min: 0.03, max: null },
];

export function bucketOf(gapRate: number, buckets: readonly GapBucket[] = GAP_BUCKETS): GapBucket | null {
  for (const b of buckets) {
    const lo = b.min === null || gapRate >= b.min;
    const hi = b.max === null || gapRate < b.max;
    if (lo && hi) return b;
  }
  return null;
}

/** ギャップ率の区分別統計 */
export function byGapBucket(metrics: readonly DailyMetric[], buckets: readonly GapBucket[] = GAP_BUCKETS): ConditionalStats[] {
  return buckets.map((b) => conditionalStats(b.key, b.label, metrics.filter((m) => bucketOf(m.gapRate, buckets)?.key === b.key)));
}
