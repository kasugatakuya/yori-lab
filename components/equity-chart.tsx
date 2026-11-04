"use client";

import { useMemo, useState } from "react";
import { fmtPct } from "@/lib/format";

/** 累積損益率の折れ線（SVG）。日付順の点列を受け取る */
export function EquityChart({ points, width = 720, height = 240 }: { points: { date: string; cumReturn: number }[]; width?: number; height?: number }) {
  const [hover, setHover] = useState<{ date: string; cumReturn: number } | null>(null);
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const { min, max } = useMemo(() => {
    const vals = points.map((p) => p.cumReturn);
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    const span = hi - lo || 0.01;
    return { min: lo - span * 0.05, max: hi + span * 0.05 };
  }, [points]);
  if (points.length === 0) return <p className="text-sm text-muted">トレードがありません。</p>;
  const xs = (i: number) => pad.l + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const ys = (v: number) => pad.t + ((max - v) / (max - min)) * h;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.cumReturn).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const yTicks = [...new Set([min, 0, max].map((v) => Math.round(v * 1000) / 1000))];
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="累積損益率の推移">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + w} y1={ys(t)} y2={ys(t)} stroke="currentColor" strokeOpacity={0.1} />
            <text x={pad.l - 6} y={ys(t) + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>
              {fmtPct(t)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={pad.l + w} y1={ys(0)} y2={ys(0)} stroke="currentColor" strokeOpacity={0.35} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={xs(i) - (w / points.length) / 2}
            y={pad.t}
            width={Math.max(2, w / points.length)}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {hover ? <circle cx={xs(points.indexOf(hover))} cy={ys(hover.cumReturn)} r={4} fill="var(--accent)" /> : null}
        <text x={pad.l} y={height - 8} fontSize="10" fill="currentColor" opacity={0.7}>
          {points[0].date}
        </text>
        <text x={pad.l + w} y={height - 8} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>
          {last.date}
        </text>
      </svg>
      <div className="mt-1 h-5 text-xs text-muted tabular">
        {hover ? `${hover.date}: 累積 ${fmtPct(hover.cumReturn)}` : `最終 ${last.date}: 累積 ${fmtPct(last.cumReturn)}`}
      </div>
    </div>
  );
}
