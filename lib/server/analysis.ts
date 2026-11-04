import "server-only";
import { computeDailyMetrics, filterByRange, takeRecent, type DailyMetric } from "@/lib/analysis/daily";
import type { Repositories } from "@/lib/db";

export interface PeriodFilter {
  /** 直近 N 営業日（null = 全期間） */
  days: number | null;
  from?: string;
  to?: string;
}

/** クエリ文字列から期間フィルタを作る。既定は「取得できる全期間」 */
export function parsePeriod(sp: Record<string, string | string[] | undefined>): PeriodFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]);
  const d = Number(one("days"));
  const from = one("from");
  const to = one("to");
  return {
    days: Number.isFinite(d) && d > 0 ? Math.floor(d) : null,
    from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
    to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : undefined,
  };
}

export function applyPeriod(metrics: readonly DailyMetric[], f: PeriodFilter): DailyMetric[] {
  return takeRecent(filterByRange(metrics, { from: f.from, to: f.to }), f.days);
}

/** 銘柄の全期間の指標（マージ済み日足から） */
export function metricsFor(repos: Repositories, code: string): DailyMetric[] {
  return computeDailyMetrics(repos.dailyBars.findMerged(code));
}

export function metricsForCodes(repos: Repositories, codes: readonly string[]): Map<string, DailyMetric[]> {
  const out = new Map<string, DailyMetric[]>();
  for (const code of codes) out.set(code, metricsFor(repos, code));
  return out;
}

export interface DataEnd {
  lastDate: string | null;
  sources: string[];
}

/** 分析対象データの終端日と出所（画面に表示する） */
export function describeMetrics(metrics: readonly DailyMetric[]): DataEnd {
  const sources = [...new Set(metrics.map((m) => m.source))];
  return { lastDate: metrics.length ? metrics[metrics.length - 1].date : null, sources };
}
