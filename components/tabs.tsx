"use client";

import { useState, type ReactNode } from "react";

export function Tabs({ tabs, initial = 0 }: { tabs: { key: string; label: string; content: ReactNode }[]; initial?: number }) {
  const [active, setActive] = useState(initial);
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={i === active}
            type="button"
            onClick={() => setActive(i)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${i === active ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" hidden={i !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
