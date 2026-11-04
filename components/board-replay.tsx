"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardSnapshot } from "@/lib/db/types";
import { fmt2, fmtInt } from "@/lib/format";

const SIGN: Record<string, string> = { "0101": "一般", "0102": "特別", "0103": "注意", "0107": "寄前", "0116": "寄前(成立無)", "0117": "寄前(成立有)", "0118": "連続約定", "0120": "買上/売下" };

/** 板スナップショットのリプレイ（スライダーと再生） */
export function BoardReplay({ snapshots }: { snapshots: BoardSnapshot[] }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const s = snapshots[idx];

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setIdx((i) => (i + 1 >= snapshots.length ? (setPlaying(false), i) : i + 1)), Math.max(40, 400 / speed));
    return () => clearInterval(id);
  }, [playing, speed, snapshots.length]);

  const maxQty = useMemo(() => (s ? Math.max(1, ...s.asks.map((a) => a[1]), ...s.bids.map((b) => b[1])) : 1), [s]);

  if (!s) return <p className="text-sm text-muted">板スナップショットがありません。</p>;
  const asksDesc = [...s.asks].sort((a, b) => b[0] - a[0]);
  const bidsDesc = [...s.bids].sort((a, b) => b[0] - a[0]);
  const askTotal = s.asks.reduce((t, a) => t + a[1], 0);
  const bidTotal = s.bids.reduce((t, b) => t + b[1], 0);
  const imb = askTotal + bidTotal > 0 ? (bidTotal - askTotal) / (bidTotal + askTotal) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => setPlaying((p) => !p)} className="rounded border border-border px-2 py-0.5 hover:text-accent">
            {playing ? "停止" : "再生"}
          </button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded border border-border bg-panel px-1 py-0.5" aria-label="再生速度">
            {[1, 2, 5, 10].map((v) => (
              <option key={v} value={v}>
                {v}x
              </option>
            ))}
          </select>
          <span className="tabular text-foreground">{s.ts.slice(11, 19)}</span>
          <span className="text-muted tabular">
            {idx + 1} / {snapshots.length}
          </span>
        </div>
        <input type="range" min={0} max={snapshots.length - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="w-full" aria-label="時刻" />
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <Item label="現在値" value={fmt2(s.currentPrice)} />
          <Item label="累計出来高" value={fmtInt(s.volume)} />
          <Item label="VWAP" value={fmt2(s.vwap)} />
          <Item label="気配種別" value={`${SIGN[s.bestAskSign ?? ""] ?? s.bestAskSign ?? "—"} / ${SIGN[s.bestBidSign ?? ""] ?? s.bestBidSign ?? "—"}`} />
          <Item label="売成行 / 買成行" value={`${fmtInt(s.marketSellQty)} / ${fmtInt(s.marketBuyQty)}`} />
          <Item label="OVER / UNDER" value={`${fmtInt(s.overSellQty)} / ${fmtInt(s.underBuyQty)}`} />
          <Item label="売り合計 / 買い合計" value={`${fmtInt(askTotal)} / ${fmtInt(bidTotal)}`} />
          <Item label="板の偏り（買−売）/（買+売）" value={imb.toFixed(2)} />
        </dl>
      </div>
      <table className="w-full text-xs tabular">
        <thead className="text-muted">
          <tr>
            <th className="text-right">売数量</th>
            <th className="text-center">価格</th>
            <th className="text-left">買数量</th>
          </tr>
        </thead>
        <tbody>
          {asksDesc.map(([p, q]) => (
            <tr key={`a${p}`}>
              <td className="relative text-right">
                <span className="absolute inset-y-0 right-0 bg-blue-500/20" style={{ width: `${(q / maxQty) * 100}%` }} />
                <span className="relative">{fmtInt(q)}</span>
              </td>
              <td className="text-center">{fmt2(p)}</td>
              <td />
            </tr>
          ))}
          {bidsDesc.map(([p, q]) => (
            <tr key={`b${p}`}>
              <td />
              <td className="text-center">{fmt2(p)}</td>
              <td className="relative text-left">
                <span className="absolute inset-y-0 left-0 bg-orange-500/20" style={{ width: `${(q / maxQty) * 100}%` }} />
                <span className="relative">{fmtInt(q)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
