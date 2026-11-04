"use client";

import { useEffect, useRef, useState } from "react";
import type { HeatmapGrid } from "@/lib/server/board";
import { fmt2, fmtInt } from "@/lib/format";

const ASK = [59, 130, 246]; // 青: 売り気配
const BID = [249, 115, 22]; // 橙: 買い気配

/** 板ヒートマップ（Canvas）: 横=時間、縦=価格、濃さ=平均気配数量。売りは青、買いは橙 */
export function BoardHeatmap({ grid, height = 360 }: { grid: HeatmapGrid; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ time: string; price: number; ask: number; bid: number } | null>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(320, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || grid.times.length === 0 || grid.prices.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const padL = 56;
    const padB = 20;
    const w = width - padL;
    const h = height - padB;
    const cw = w / grid.times.length;
    const ch = h / grid.prices.length;
    const maxQ = Math.max(1, ...grid.cells.map((c) => Math.max(c[2], c[3])));
    for (const [ti, pi, ask, bid] of grid.cells) {
      const x = padL + ti * cw;
      const y = h - (pi + 1) * ch;
      if (ask > 0) {
        ctx.fillStyle = `rgba(${ASK[0]},${ASK[1]},${ASK[2]},${0.15 + 0.85 * Math.sqrt(ask / maxQ)})`;
        ctx.fillRect(x, y, Math.ceil(cw), Math.ceil(ch));
      }
      if (bid > 0) {
        ctx.fillStyle = `rgba(${BID[0]},${BID[1]},${BID[2]},${0.15 + 0.85 * Math.sqrt(bid / maxQ)})`;
        ctx.fillRect(x, y, Math.ceil(cw), Math.ceil(ch));
      }
    }
    // 現在値の線
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim() || "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    grid.lastPrice.forEach((p, ti) => {
      if (p === null) return;
      let pi = grid.prices.findIndex((pp) => pp >= p);
      if (pi < 0) pi = grid.prices.length - 1;
      const x = padL + ti * cw + cw / 2;
      const y = h - pi * ch - ch / 2;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // 軸ラベル
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#666";
    ctx.font = "10px sans-serif";
    const step = Math.max(1, Math.floor(grid.prices.length / 8));
    for (let i = 0; i < grid.prices.length; i += step) {
      ctx.fillText(fmt2(grid.prices[i]), 2, h - i * ch - 2);
    }
    const tstep = Math.max(1, Math.floor(grid.times.length / 8));
    for (let i = 0; i < grid.times.length; i += tstep) {
      ctx.fillText(grid.times[i].slice(11, 16), padL + i * cw, height - 6);
    }
  }, [grid, width, height]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const padL = 56;
    const padB = 20;
    const cw = (width - padL) / grid.times.length;
    const ch = (height - padB) / grid.prices.length;
    const ti = Math.floor((x - padL) / cw);
    const pi = Math.floor((height - padB - y) / ch);
    if (ti < 0 || ti >= grid.times.length || pi < 0 || pi >= grid.prices.length) {
      setHover(null);
      return;
    }
    const cell = grid.cells.find((c) => c[0] === ti && c[1] === pi);
    setHover({ time: grid.times[ti], price: grid.prices[pi], ask: cell?.[2] ?? 0, bid: cell?.[3] ?? 0 });
  };

  if (grid.times.length === 0) return <p className="text-sm text-muted">板スナップショットがありません。</p>;
  return (
    <div className="w-full">
      <canvas ref={ref} style={{ width, height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block" />
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted tabular">
        <span>
          <span className="inline-block h-3 w-3 align-middle" style={{ background: `rgb(${ASK.join(",")})` }} /> 売り気配
        </span>
        <span>
          <span className="inline-block h-3 w-3 align-middle" style={{ background: `rgb(${BID.join(",")})` }} /> 買い気配
        </span>
        <span>線: 現在値</span>
        <span>{grid.bucketSec}秒ごとの平均数量</span>
        {hover ? (
          <span className="text-foreground">
            {hover.time.slice(11, 19)} {fmt2(hover.price)}: 売 {fmtInt(hover.ask)} / 買 {fmtInt(hover.bid)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
