"use client";

import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import Link from "next/link";
import { useState } from "react";
import type { StockSummary } from "@/lib/analysis/daily";
import { MIN_RELIABLE_SAMPLES } from "@/lib/analysis/daily";
import { fmtInt, fmtPct, fmt2 } from "@/lib/format";

const col = createColumnHelper<StockSummary>();

/** null は最小値として扱う（既定の降順では末尾に来る） */
const nullLow = (a: { getValue: (id: string) => unknown }, b: { getValue: (id: string) => unknown }, id: string) => {
  const av = a.getValue(id) as number | null;
  const bv = b.getValue(id) as number | null;
  const x = av === null ? -Infinity : av;
  const y = bv === null ? -Infinity : bv;
  return x === y ? 0 : x < y ? -1 : 1;
};

function Pct({ v, signed = true }: { v: number | null; signed?: boolean }) {
  const cls = signed && v !== null ? (v > 0 ? "text-up" : v < 0 ? "text-down" : "") : "";
  return <span className={`tabular ${cls}`}>{fmtPct(v)}</span>;
}

const columns = [
  col.accessor("code", {
    header: "コード",
    cell: (c) => (
      <Link href={`/stocks/${c.getValue()}`} className="font-mono text-accent hover:underline">
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor("name", { header: "銘柄名" }),
  col.accessor("count", {
    header: "日数",
    cell: (c) => (
      <span className="tabular">
        {fmtInt(c.getValue())}
        {c.getValue() > 0 && c.getValue() < MIN_RELIABLE_SAMPLES ? <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-300">参考</span> : null}
      </span>
    ),
  }),
  col.accessor("winRate", { sortingFn: nullLow, header: "勝率", cell: (c) => <Pct v={c.getValue()} signed={false} /> }),
  col.accessor("avgOpenToClose", { sortingFn: nullLow, header: "平均 寄→引", cell: (c) => <Pct v={c.getValue()} /> }),
  col.accessor("medianOpenToClose", { sortingFn: nullLow, header: "中央値", cell: (c) => <Pct v={c.getValue()} /> }),
  col.accessor("totalReturn", { sortingFn: nullLow, header: "累積", cell: (c) => <Pct v={c.row.original.count ? c.getValue() : null} /> }),
  col.accessor("maxDrawdown", { sortingFn: nullLow, header: "最大DD", cell: (c) => <span className="tabular">{c.row.original.count ? fmtPct(c.getValue()) : "—"}</span> }),
  col.accessor("avgGapRate", { sortingFn: nullLow, header: "平均ギャップ", cell: (c) => <Pct v={c.getValue()} /> }),
  col.accessor("continuationRate", { sortingFn: nullLow, header: "継続率", cell: (c) => <Pct v={c.getValue()} signed={false} /> }),
  col.accessor("reversalRate", { sortingFn: nullLow, header: "反転率", cell: (c) => <Pct v={c.getValue()} signed={false} /> }),
  col.accessor("avgRange", { sortingFn: nullLow, header: "平均値幅", cell: (c) => <Pct v={c.getValue()} signed={false} /> }),
  col.accessor("avgVolumeRatio", { sortingFn: nullLow, header: "出来高比", cell: (c) => <span className="tabular">{c.getValue() === null ? "—" : `${fmt2(c.getValue())}x`}</span> }),
  col.accessor("lastDate", { header: "終端日", cell: (c) => <span className="tabular text-xs">{c.getValue() ?? "—"}</span> }),
];

export function RankingTable({ rows }: { rows: StockSummary[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "winRate", desc: true }]);
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-sm [&_td]:px-2 [&_th]:px-2">
        <thead className="text-left text-xs text-muted">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                const numeric = !["code", "name", "lastDate"].includes(h.column.id);
                return (
                  <th key={h.id} className={`py-1 ${numeric ? "text-right" : ""}`}>
                    <button type="button" onClick={h.column.getToggleSortingHandler()} className="hover:text-foreground">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              {r.getVisibleCells().map((c) => {
                const numeric = !["code", "name", "lastDate"].includes(c.column.id);
                return (
                  <td key={c.id} className={`py-1 ${numeric ? "text-right" : ""}`}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
