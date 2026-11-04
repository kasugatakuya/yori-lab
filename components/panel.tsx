import type { ReactNode } from "react";

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-panel p-4 ${className}`}>
      {title ? <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2> : null}
      {children}
    </section>
  );
}
