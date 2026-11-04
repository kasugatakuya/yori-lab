import { maxDrawdown, mean } from "./stats";
import type { DailyMetric } from "./types";

export type Side = "long" | "short";

export interface BacktestParams {
  side: Side;
  /** ギャップ率の下限・上限（含む / 含まない）。小数（0.01 = 1%） */
  gapMin?: number | null;
  gapMax?: number | null;
  /** 出来高の直近平均比の下限 */
  minVolumeRatio?: number | null;
  /** 損切り幅（小数）。null で引けまで保有 */
  stopLossPct?: number | null;
  /** 利確幅（小数）。null で引けまで保有 */
  takeProfitPct?: number | null;
}

export type ExitReason = "close" | "stop" | "take" | "undetermined";

export interface BacktestTrade {
  code: string;
  date: string;
  side: Side;
  entry: number;
  exit: number | null;
  /** 損益率。判定不能日は null */
  ret: number | null;
  exitReason: ExitReason;
  gapRate: number;
}

export interface BacktestSummary {
  trades: number;
  determined: number;
  undetermined: number;
  wins: number;
  winRate: number | null;
  avgReturn: number | null;
  totalReturn: number;
  maxDrawdown: number;
  profitFactor: number | null;
}

export interface BacktestResult {
  params: BacktestParams;
  trades: BacktestTrade[];
  summary: BacktestSummary;
  /** 日別の累積損益率（判定可能なトレードのみ） */
  equity: { date: string; dailyReturn: number; cumReturn: number }[];
}

export function matchesCondition(m: DailyMetric, p: BacktestParams): boolean {
  if (p.gapMin !== null && p.gapMin !== undefined && m.gapRate < p.gapMin) return false;
  if (p.gapMax !== null && p.gapMax !== undefined && m.gapRate >= p.gapMax) return false;
  if (p.minVolumeRatio !== null && p.minVolumeRatio !== undefined) {
    if (m.volumeRatio === null || m.volumeRatio < p.minVolumeRatio) return false;
  }
  return true;
}

/**
 * 1日のトレードを評価する。
 * 日足では高値と安値のどちらが先に付いたか分からないため、損切りと利確の両方に到達した日は
 * "undetermined"（判定不能）として損益を null にする。
 */
export function evaluateTrade(m: DailyMetric, p: BacktestParams): BacktestTrade {
  const sign = p.side === "long" ? 1 : -1;
  const sl = p.stopLossPct ?? null;
  const tp = p.takeProfitPct ?? null;
  const entry = m.open;
  // ロング: 損切りは安値側、利確は高値側。ショートは逆
  const adverse = p.side === "long" ? -m.openToLow : m.openToHigh; // 逆行幅（0以上）
  const favorable = p.side === "long" ? m.openToHigh : -m.openToLow; // 順行幅（0以上）
  const hitStop = sl !== null && sl > 0 && adverse >= sl;
  const hitTake = tp !== null && tp > 0 && favorable >= tp;
  const base = { code: m.code, date: m.date, side: p.side, entry, gapRate: m.gapRate };
  if (hitStop && hitTake) return { ...base, exit: null, ret: null, exitReason: "undetermined" };
  if (hitStop) return { ...base, exit: entry * (1 - sign * sl!), ret: -sl!, exitReason: "stop" };
  if (hitTake) return { ...base, exit: entry * (1 + sign * tp!), ret: tp!, exitReason: "take" };
  return { ...base, exit: m.close, ret: sign * m.openToClose, exitReason: "close" };
}

export function runBacktest(metricsByCode: ReadonlyMap<string, readonly DailyMetric[]>, params: BacktestParams): BacktestResult {
  const trades: BacktestTrade[] = [];
  for (const [, metrics] of metricsByCode) {
    for (const m of metrics) if (matchesCondition(m, params)) trades.push(evaluateTrade(m, params));
  }
  trades.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : 1));

  const byDate = new Map<string, number>();
  for (const t of trades) if (t.ret !== null) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.ret);
  const dailyReturns = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let cum = 0;
  const equity = dailyReturns.map(([date, r]) => {
    cum += r;
    return { date, dailyReturn: r, cumReturn: cum };
  });

  const determined = trades.filter((t) => t.ret !== null) as (BacktestTrade & { ret: number })[];
  const wins = determined.filter((t) => t.ret > 0);
  const grossProfit = wins.reduce((s, t) => s + t.ret, 0);
  const grossLoss = determined.filter((t) => t.ret < 0).reduce((s, t) => s - t.ret, 0);
  return {
    params,
    trades,
    equity,
    summary: {
      trades: trades.length,
      determined: determined.length,
      undetermined: trades.length - determined.length,
      wins: wins.length,
      winRate: determined.length ? wins.length / determined.length : null,
      avgReturn: mean(determined.map((t) => t.ret)),
      totalReturn: determined.reduce((s, t) => s + t.ret, 0),
      maxDrawdown: maxDrawdown(dailyReturns.map(([, r]) => r)),
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    },
  };
}
