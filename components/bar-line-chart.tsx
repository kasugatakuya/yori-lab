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

export interface BarPoint {
  label: string;
  /** 正負の棒（例: 買い数量と −売り数量）または単一値 */
  pos?: number;
  neg?: number;
  value?: number;
}

/**
 * 小さな SVG 棒グラフ。pos/neg があれば上下に積む（買い=橙、売り=青）、value だけなら符号で色分け。
 * 板分析の時間帯別フロー・OFI・偏りの推移に使う。
 */
export function BarLineChart({ points, title, width = 720, height = 180, format = "int" }: { points: BarPoint[]; title: string; width?: number; height?: number; format?: NumberFormat }) {
  const fmt = FORMATS[format];
  const [hover, setHover] = useState<BarPoint | null>(null);
  const pad = { l: 56, r: 8, t: 8, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  if (points.length === 0) return <p className="text-sm text-muted">{title}: データがありません。</p>;
  const vals = points.flatMap((p) => [p.pos ?? 0, -(p.neg ?? 0), p.value ?? 0]);
  const max = Math.max(1e-9, ...vals.map((v) => Math.abs(v)));
  const y0 = pad.t + h / 2;
  const ys = (v: number) => y0 - (v / max) * (h / 2);
  const bw = Math.max(1, w / points.length - 1);
  return (
    <div>
      <div className="mb-1 text-xs text-muted">
        {title}
        {hover ? (
          <span className="ml-2 text-foreground tabular">
            {hover.label}
            {hover.value !== undefined ? ` ${fmt(hover.value)}` : ""}
            {hover.pos !== undefined ? ` 買 ${fmt(hover.pos)}` : ""}
            {hover.neg !== undefined ? ` 売 ${fmt(hover.neg)}` : ""}
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        <line x1={pad.l} x2={pad.l + w} y1={y0} y2={y0} stroke="currentColor" strokeOpacity={0.3} />
        <text x={pad.l - 4} y={pad.t + 10} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>
          {fmt(max)}
        </text>
        <text x={pad.l - 4} y={pad.t + h} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>
          {fmt(-max)}
        </text>
        {points.map((p, i) => {
          const x = pad.l + (i * w) / points.length;
          return (
            <g key={i} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={pad.t} width={bw + 1} height={h} fill="transparent" />
              {p.pos !== undefined && p.pos > 0 ? <rect x={x} y={ys(p.pos)} width={bw} height={y0 - ys(p.pos)} fill="#f97316" fillOpacity={0.8} /> : null}
              {p.neg !== undefined && p.neg > 0 ? <rect x={x} y={y0} width={bw} height={ys(-p.neg) - y0} fill="#3b82f6" fillOpacity={0.8} /> : null}
              {p.value !== undefined && p.value !== 0 ? (
                <rect x={x} y={Math.min(y0, ys(p.value))} width={bw} height={Math.abs(y0 - ys(p.value))} className={p.value > 0 ? "fill-up" : "fill-down"} fillOpacity={0.8} />
              ) : null}
            </g>
          );
        })}
        {points.map((p, i) =>
          i % Math.max(1, Math.floor(points.length / 8)) === 0 ? (
            <text key={`l${i}`} x={pad.l + (i * w) / points.length} y={height - 6} fontSize="10" fill="currentColor" opacity={0.7}>
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
