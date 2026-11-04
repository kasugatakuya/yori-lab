import type { ReactNode } from "react";

export function Notice({ kind = "info", children }: { kind?: "info" | "warn"; children: ReactNode }) {
  const cls =
    kind === "warn"
      ? "border-amber-400/60 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : "border-border bg-panel text-foreground";
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
