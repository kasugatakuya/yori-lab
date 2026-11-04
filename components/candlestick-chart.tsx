"use client";

import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type MouseEventParams } from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BarSource } from "@/lib/db/types";
import { fmt2, fmtInt } from "@/lib/format";
import { useSettings } from "./settings-context";
import { SourceBadge } from "./source-badge";

/** サーバーから渡す最小限の日足（シリアライズ可能） */
export interface ChartBar {
  /** 日足は "YYYY-MM-DD"、分足は UNIX 秒（UTC） */
  date: string | number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  source: BarSource;
}

type RangeKey = "all" | "1y" | "6m" | "3m" | "1m";
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "all", label: "全期間", days: null },
  { key: "1y", label: "1年", days: 365 },
  { key: "6m", label: "6ヶ月", days: 182 },
  { key: "3m", label: "3ヶ月", days: 91 },
  { key: "1m", label: "1ヶ月", days: 31 },
];

/** CSS 変数（--up / --down など）の現在値を読む */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function shiftDate(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CandlestickChart({ bars, height = 420, intraday = false }: { bars: ChartBar[]; height?: number; intraday?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();
  const { upDown } = useSettings();
  const [range, setRange] = useState<RangeKey>("all");
  const [hover, setHover] = useState<ChartBar | null>(null);

  const valid = useMemo(
    () => bars.filter((b) => b.open !== null && b.high !== null && b.low !== null && b.close !== null),
    [bars],
  );
  const byDate = useMemo(() => new Map(valid.map((b) => [String(b.date), b])), [valid]);
  const last = valid[valid.length - 1] ?? null;
  const shown = hover ?? last;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || valid.length === 0) return;

    const dark = resolvedTheme === "dark";
    const up = cssVar("--up", upDown === "intl" ? "#16a34a" : "#dc2626");
    const down = cssVar("--down", upDown === "intl" ? "#dc2626" : "#16a34a");
    const text = cssVar("--muted", dark ? "#94a3b8" : "#64748b");
    const grid = dark ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.14)";

    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontSize: 11 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: 1 },
      localization: { locale: "ja-JP" },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    candles.setData(valid.map((b) => ({ time: b.date as never, open: b.open!, high: b.high!, low: b.low!, close: b.close! })));

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, borderVisible: false });
    const alpha = (hex: string) => (hex.startsWith("#") && hex.length === 7 ? `${hex}66` : hex);
    volume.setData(
      valid.map((b) => ({ time: b.date as never, value: b.volume ?? 0, color: alpha(b.close! >= b.open! ? up : down) })),
    );

    const onMove = (p: MouseEventParams) => {
      if (p.time === undefined || p.time === null || typeof p.time === "object") {
        setHover(null);
        return;
      }
      setHover(byDate.get(String(p.time)) ?? null);
    };
    chart.subscribeCrosshairMove(onMove);

    const sel = RANGES.find((r) => r.key === range);
    const lastDate = valid[valid.length - 1].date;
    if (!intraday && sel?.days && typeof lastDate === "string") {
      chart.timeScale().setVisibleRange({ from: shiftDate(lastDate, -sel.days), to: lastDate });
    } else {
      chart.timeScale().fitContent();
    }

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [valid, byDate, resolvedTheme, upDown, height, range, intraday]);

  if (valid.length === 0) {
    return <p className="text-sm text-muted">表示できる日足がありません。</p>;
  }

  const diff = shown && shown.open !== null && shown.close !== null ? shown.close - shown.open : null;
  const diffCls = diff === null ? "" : diff > 0 ? "text-up" : diff < 0 ? "text-down" : "";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <div className={`flex gap-1 ${intraday ? "hidden" : ""}`}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded border px-2 py-0.5 ${range === r.key ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {shown ? (
          <div className="flex flex-wrap items-center gap-x-3 tabular text-muted">
            <span className="text-foreground">{typeof shown.date === "number" ? new Date(shown.date * 1000).toISOString().slice(11, 16) : shown.date}</span>
            <span>始 {fmt2(shown.open)}</span>
            <span>高 {fmt2(shown.high)}</span>
            <span>安 {fmt2(shown.low)}</span>
            <span className={diffCls}>終 {fmt2(shown.close)}</span>
            <span>出来高 {fmtInt(shown.volume)}</span>
            <SourceBadge source={shown.source} />
          </div>
        ) : null}
      </div>
      <div ref={containerRef} style={{ height }} className="w-full" />
    </div>
  );
}
