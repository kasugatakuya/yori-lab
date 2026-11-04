"use client";

import { useState } from "react";
import { fmtInt } from "@/lib/format";

/** サーバーコンポーネントから関数は渡せないので、書式は名前で指定する */
export type NumberFormat = "int" | "fixed2" | "pct";
const FORMATS: Record<NumberFormat, (v: number) => string> = {
  int: (v) => fmtInt(v),
  fixed2: (v) => v.toFixed(2),
  pct: (v) => `${(v * 100).toFixed(2)}%`,
};

/** 小さな SVG 折れ線（寄り前の気配推移など） */
export function LineChart({ points, title, width = 720, height = 180, format = "fixed2" }: { points: { label: string; value: number | null }[]; title: string; width?: number; height?: number; format?: NumberFormat }) {
  const fmt = FORMATS[format];
  const [hover, setHover] = useState<{ label: string; value: number | null } | null>(null);
  const pad = { l: 56, r: 8, t: 8, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const valid = points.filter((p) => p.value !== null) as { label: string; value: number }[];
  if (valid.length === 0) return <p className="text-sm text-muted">{title}: データがありません。</p>;
  const min = Math.min(...valid.map((p) => p.value));
  const max = Math.max(...valid.map((p) => p.value));
  const span = max - min || Math.abs(max) * 0.01 || 1;
  const ys = (v: number) => pad.t + ((max + span * 0.05 - v) / (span * 1.1)) * h;
  const xs = (i: number) => pad.l + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  let d = "";
  points.forEach((p, i) => {
    if (p.value === null) return;
    d += `${d === "" ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.value).toFixed(1)} `;
  });
  return (
    <div>
      <div className="mb-1 text-xs text-muted">
        {title}
        {hover ? <span className="ml-2 text-foreground tabular">{hover.label} {hover.value === null ? "—" : fmt(hover.value)}</span> : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        {[max, (max + min) / 2, min].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={pad.l + w} y1={ys(v)} y2={ys(v)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={pad.l - 4} y={ys(v) + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>
              {fmt(v)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        {points.map((p, i) => (
          <rect key={i} x={xs(i) - w / points.length / 2} y={pad.t} width={Math.max(2, w / points.length)} height={h} fill="transparent" onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} />
        ))}
        {points.map((p, i) =>
          i % Math.max(1, Math.floor(points.length / 8)) === 0 ? (
            <text key={`l${i}`} x={xs(i)} y={height - 6} fontSize="10" fill="currentColor" opacity={0.7} textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
