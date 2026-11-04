"use client";

import { useMemo, useState } from "react";
import { fmtPct } from "@/lib/format";

export interface ScatterPoint {
  x: number;
  y: number;
  label: string;
}

/**
 * 軽量な SVG 散布図（ギャップ率 × 寄り→引け騰落率）。
 * 依存を増やさず、ホバーで値を表示する。色は騰落色の設定（--up / --down）に従う。
 */
export function ScatterChart({
  points,
  xLabel,
  yLabel,
  width = 640,
  height = 360,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  width?: number;
  height?: number;
}) {
  const [hover, setHover] = useState<ScatterPoint | null>(null);
  const pad = { l: 56, r: 16, t: 12, b: 36 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const { xs, ys, xMax, yMax } = useMemo(() => {
    const xAbs = Math.max(0.01, ...points.map((p) => Math.abs(p.x)));
    const yAbs = Math.max(0.01, ...points.map((p) => Math.abs(p.y)));
    const xm = Math.ceil(xAbs * 100) / 100;
    const ym = Math.ceil(yAbs * 100) / 100;
    return {
      xMax: xm,
      yMax: ym,
      xs: (v: number) => pad.l + ((v + xm) / (2 * xm)) * w,
      ys: (v: number) => pad.t + ((ym - v) / (2 * ym)) * h,
    };
  }, [points, w, h, pad.l, pad.t]);

  if (points.length === 0) return <p className="text-sm text-muted">表示できるデータがありません。</p>;

  const ticks = (max: number) => [-max, -max / 2, 0, max / 2, max];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[720px]" role="img" aria-label={`${xLabel}と${yLabel}の散布図`}>
        {ticks(xMax).map((t) => (
          <g key={`x${t}`}>
            <line x1={xs(t)} x2={xs(t)} y1={pad.t} y2={pad.t + h} stroke="currentColor" strokeOpacity={t === 0 ? 0.35 : 0.1} />
            <text x={xs(t)} y={height - 14} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.7}>
              {fmtPct(t)}
            </text>
          </g>
        ))}
        {ticks(yMax).map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={pad.l + w} y1={ys(t)} y2={ys(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.35 : 0.1} />
            <text x={pad.l - 6} y={ys(t) + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>
              {fmtPct(t)}
            </text>
          </g>
        ))}
        <text x={pad.l + w / 2} y={height - 2} textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.8}>
          {xLabel}
        </text>
        <text x={12} y={pad.t + h / 2} textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.8} transform={`rotate(-90 12 ${pad.t + h / 2})`}>
          {yLabel}
        </text>
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xs(p.x)}
            cy={ys(p.y)}
            r={hover === p ? 5 : 3.5}
            className={p.y >= 0 ? "fill-up" : "fill-down"}
            fillOpacity={0.7}
            stroke="var(--panel)"
            strokeWidth={1}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      <div className="mt-1 h-5 text-xs text-muted tabular">
        {hover ? `${hover.label}: ${xLabel} ${fmtPct(hover.x)} / ${yLabel} ${fmtPct(hover.y)}` : "点にカーソルを合わせると値を表示します"}
      </div>
    </div>
  );
}
