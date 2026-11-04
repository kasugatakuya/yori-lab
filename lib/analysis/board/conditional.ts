import type { BoardDaySummary } from "./types";

export interface BoardConditionStats {
  key: string;
  label: string;
  count: number;
  /** 5分後・15分後・引けの平均騰落率と上昇率 */
  avgMove5m: number | null;
  upRate5m: number | null;
  avgMove15m: number | null;
  upRate15m: number | null;
  avgMoveClose: number | null;
  upRateClose: number | null;
  reliable: boolean;
}

export const MIN_RELIABLE_BOARD_SAMPLES = 20;

function stat(xs: (number | null)[]): { avg: number | null; up: number | null } {
  const v = xs.filter((x): x is number => x !== null);
  if (v.length === 0) return { avg: null, up: null };
  return { avg: v.reduce((s, x) => s + x, 0) / v.length, up: v.filter((x) => x > 0).length / v.length };
}

export function conditionStats(key: string, label: string, days: readonly BoardDaySummary[]): BoardConditionStats {
  const m5 = stat(days.map((d) => d.postOpen.move5m));
  const m15 = stat(days.map((d) => d.postOpen.move15m));
  const mc = stat(days.map((d) => d.moveToClose));
  return {
    key,
    label,
    count: days.length,
    avgMove5m: m5.avg,
    upRate5m: m5.up,
    avgMove15m: m15.avg,
    upRate15m: m15.up,
    avgMoveClose: mc.avg,
    upRateClose: mc.up,
    reliable: days.length >= MIN_RELIABLE_BOARD_SAMPLES,
  };
}

/** 寄り前の板の偏り（買い優勢 / 売り優勢）と、寄り直後の OFI（正 / 負）で条件分け */
export function boardConditionTable(days: readonly BoardDaySummary[], imbalanceThreshold = 0.2): BoardConditionStats[] {
  const pre = (d: BoardDaySummary) => d.preOpen.lastImbalance;
  const ofi = (d: BoardDaySummary) => d.postOpen.ofi1m;
  return [
    conditionStats("all", "全日", days),
    conditionStats("pre-bid", `寄り前: 買い優勢（偏り ≥ ${imbalanceThreshold}）`, days.filter((d) => (pre(d) ?? 0) >= imbalanceThreshold)),
    conditionStats("pre-ask", `寄り前: 売り優勢（偏り ≤ -${imbalanceThreshold}）`, days.filter((d) => (pre(d) ?? 0) <= -imbalanceThreshold)),
    conditionStats("pre-flat", "寄り前: 拮抗", days.filter((d) => Math.abs(pre(d) ?? 0) < imbalanceThreshold && pre(d) !== null)),
    conditionStats("ofi-pos", "寄り直後1分の OFI が正", days.filter((d) => (ofi(d) ?? 0) > 0)),
    conditionStats("ofi-neg", "寄り直後1分の OFI が負", days.filter((d) => (ofi(d) ?? 0) < 0)),
    conditionStats("gap-up-pre", "寄り前気配が前日終値より上 かつ 買い優勢", days.filter((d) => (pre(d) ?? 0) >= imbalanceThreshold && (d.preOpen.deviationFromOpen ?? 0) <= 0)),
  ];
}
