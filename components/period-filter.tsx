"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const PRESETS: { label: string; days: number | null }[] = [
  { label: "全期間", days: null },
  { label: "直近20日", days: 20 },
  { label: "直近60日", days: 60 },
  { label: "直近120日", days: 120 },
  { label: "直近250日", days: 250 },
];

/** 期間フィルタ。URL の ?days=&from=&to= を更新する */
export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const days = sp.get("days");
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <div className="flex gap-1">
        {PRESETS.map((p) => {
          const active = (p.days === null && !days) || String(p.days) === days;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => update({ days: p.days === null ? null : String(p.days) })}
              className={`rounded border px-2 py-0.5 ${active ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-1">
        <span className="text-muted">開始</span>
        <input type="date" defaultValue={from} onChange={(e) => update({ from: e.target.value })} className="rounded border border-border bg-panel px-1 py-0.5" />
      </label>
      <label className="flex items-center gap-1">
        <span className="text-muted">終了</span>
        <input type="date" defaultValue={to} onChange={(e) => update({ to: e.target.value })} className="rounded border border-border bg-panel px-1 py-0.5" />
      </label>
      {pending ? <span className="text-muted">更新中…</span> : null}
    </div>
  );
}
