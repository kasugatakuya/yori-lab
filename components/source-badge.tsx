import type { BarSource } from "@/lib/db/types";

const LABEL: Record<BarSource, { text: string; title: string; cls: string }> = {
  jquants: { text: "J-Quants", title: "J-Quants API（JPX公式）", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  kabu: { text: "kabu", title: "kabuステーションAPIから自前生成した日足", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  yahoo: { text: "Yahoo", title: "Yahoo Finance 非公式API（補完用・精度保証なし）", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
};

export function SourceBadge({ source }: { source: BarSource }) {
  const l = LABEL[source];
  return (
    <span title={l.title} className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${l.cls}`}>
      {l.text}
    </span>
  );
}
