import type { DailyBar } from "@/lib/db/types";

export interface SelectionConfig {
  maxSymbols: number;
  lookbackDays: number;
  weights: { turnover: number; range: number; gapAbs: number };
  excludeCodes: string[];
  alwaysInclude: string[];
}

export interface Candidate {
  code: string;
  bars: DailyBar[];
}

export interface Scored {
  code: string;
  score: number;
  avgTurnover: number | null;
  avgRange: number | null;
  lastGapAbs: number | null;
  lastDate: string | null;
  reason: string;
}

export function parseSelectionConfig(json: unknown): SelectionConfig {
  const o = (json ?? {}) as Partial<SelectionConfig> & { weights?: Partial<SelectionConfig["weights"]> };
  return {
    maxSymbols: Math.max(1, Math.min(50, Number(o.maxSymbols ?? 50))),
    lookbackDays: Math.max(1, Number(o.lookbackDays ?? 5)),
    weights: { turnover: Number(o.weights?.turnover ?? 1), range: Number(o.weights?.range ?? 1), gapAbs: Number(o.weights?.gapAbs ?? 0) },
    excludeCodes: Array.isArray(o.excludeCodes) ? o.excludeCodes.map(String) : [],
    alwaysInclude: Array.isArray(o.alwaysInclude) ? o.alwaysInclude.map(String) : [],
  };
}

function rankScore(values: (number | null)[]): number[] {
  // 値が大きいほど 1 に近い順位スコア。null は 0
  const idx = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null);
  idx.sort((a, b) => a[0] - b[0]);
  const out = values.map(() => 0);
  idx.forEach(([, i], r) => {
    out[i] = idx.length > 1 ? r / (idx.length - 1) : 1;
  });
  return out;
}

/**
 * 前日までの日足から当日の購読銘柄を選ぶ純粋関数。
 * 指標: 直近 N 日の平均売買代金、平均値幅（(高値−安値)/始値）、直近日のギャップ率の絶対値。
 */
export function selectSymbols(candidates: readonly Candidate[], config: SelectionConfig, universeOrder: readonly string[]): { selected: string[]; scored: Scored[] } {
  const exclude = new Set(config.excludeCodes);
  const metrics = candidates
    .filter((c) => !exclude.has(c.code))
    .map((c) => {
      const bars = c.bars.filter((b) => b.open !== null && b.high !== null && b.low !== null && b.close !== null).slice(-(config.lookbackDays + 1));
      const recent = bars.slice(-config.lookbackDays);
      const turnover = recent.map((b) => b.turnover ?? (b.volume !== null && b.close !== null ? b.volume * b.close : null)).filter((v): v is number => v !== null);
      const ranges = recent.map((b) => (b.high! - b.low!) / b.open!);
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      return {
        code: c.code,
        avgTurnover: turnover.length ? turnover.reduce((s, v) => s + v, 0) / turnover.length : null,
        avgRange: ranges.length ? ranges.reduce((s, v) => s + v, 0) / ranges.length : null,
        lastGapAbs: last && prev && prev.close ? Math.abs((last.open! - prev.close) / prev.close) : null,
        lastDate: last?.date ?? null,
      };
    });
  const tScore = rankScore(metrics.map((m) => m.avgTurnover));
  const rScore = rankScore(metrics.map((m) => m.avgRange));
  const gScore = rankScore(metrics.map((m) => m.lastGapAbs));
  const scored: Scored[] = metrics.map((m, i) => ({
    ...m,
    score: tScore[i] * config.weights.turnover + rScore[i] * config.weights.range + gScore[i] * config.weights.gapAbs,
    reason: m.lastDate ? `turnover=${tScore[i].toFixed(2)} range=${rScore[i].toFixed(2)} gap=${gScore[i].toFixed(2)}` : "no data",
  }));
  scored.sort((a, b) => b.score - a.score || (a.code < b.code ? -1 : 1));
  const selected: string[] = [];
  for (const c of config.alwaysInclude) if (!exclude.has(c) && !selected.includes(c)) selected.push(c);
  for (const s of scored) {
    if (selected.length >= config.maxSymbols) break;
    if (s.lastDate && !selected.includes(s.code)) selected.push(s.code);
  }
  // データが無い銘柄は universe の順で補う
  for (const code of universeOrder) {
    if (selected.length >= config.maxSymbols) break;
    if (!exclude.has(code) && !selected.includes(code)) selected.push(code);
  }
  return { selected: selected.slice(0, config.maxSymbols), scored };
}
