import type { DailyBar } from "@/lib/db/types";
import type { DailyMetric } from "./types";

export interface MetricOptions {
  /** 出来高平均の窓（営業日数） */
  volumeWindow?: number;
}

function px(bar: DailyBar): { o: number; h: number; l: number; c: number } | null {
  const o = bar.adjOpen ?? bar.open;
  const h = bar.adjHigh ?? bar.high;
  const l = bar.adjLow ?? bar.low;
  const c = bar.adjClose ?? bar.close;
  if (o === null || h === null || l === null || c === null) return null;
  if (!(o > 0) || !(h > 0) || !(l > 0) || !(c > 0)) return null;
  return { o, h, l, c };
}

/**
 * 日足系列（日付昇順、1銘柄）から寄り付き指標を計算する純粋関数。
 * - 四本値が揃わない日（無約定・売買停止）は飛ばし、その次の日の前日終値は直前の有効な日の終値を使う
 * - 最初の有効な日は前日終値が無いので出力しない
 */
export function computeDailyMetrics(bars: readonly DailyBar[], opts: MetricOptions = {}): DailyMetric[] {
  const window = opts.volumeWindow ?? 20;
  const out: DailyMetric[] = [];
  let prev: { close: number; date: string } | null = null;
  const volumes: number[] = [];
  const sorted = [...bars].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const bar of sorted) {
    const p = px(bar);
    if (!p) continue;
    const vol = bar.adjVolume ?? bar.volume;
    if (prev) {
      let volumeRatio: number | null = null;
      if (vol !== null && volumes.length >= window) {
        const recent = volumes.slice(-window);
        const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
        volumeRatio = avg > 0 ? vol / avg : null;
      }
      out.push({
        code: bar.code,
        date: bar.date,
        source: bar.source,
        open: p.o,
        high: p.h,
        low: p.l,
        close: p.c,
        volume: vol,
        prevClose: prev.close,
        prevDate: prev.date,
        gapRate: (p.o - prev.close) / prev.close,
        openToClose: (p.c - p.o) / p.o,
        openToHigh: (p.h - p.o) / p.o,
        openToLow: (p.l - p.o) / p.o,
        volumeRatio,
      });
    }
    prev = { close: p.c, date: bar.date };
    if (vol !== null) volumes.push(vol);
  }
  return out;
}

/** 直近 N 営業日に絞る（N が null/0 なら全期間） */
export function takeRecent<T extends { date: string }>(items: readonly T[], days: number | null | undefined): T[] {
  if (!days || days <= 0) return [...items];
  return items.slice(Math.max(0, items.length - days));
}

export function filterByRange<T extends { date: string }>(items: readonly T[], range: { from?: string; to?: string }): T[] {
  return items.filter((m) => (!range.from || m.date >= range.from) && (!range.to || m.date <= range.to));
}
