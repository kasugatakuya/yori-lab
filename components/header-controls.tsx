"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { useSettings } from "./settings-context";

export function HeaderControls() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { upDown, setUpDown } = useSettings();
  // SSR と初回描画の不一致を避けるため、マウント後にだけ現在のテーマを表示する
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="flex items-center gap-1">
        <span className="text-muted">騰落色</span>
        <select
          className="rounded border border-border bg-panel px-1 py-0.5"
          value={upDown}
          onChange={(e) => setUpDown(e.target.value as "jp" | "intl")}
          aria-label="騰落の色の慣習"
        >
          <option value="jp">上昇=赤 / 下落=緑</option>
          <option value="intl">上昇=緑 / 下落=赤</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-muted">テーマ</span>
        <select
          className="rounded border border-border bg-panel px-1 py-0.5"
          value={mounted ? (theme ?? "system") : "system"}
          onChange={(e) => setTheme(e.target.value)}
          aria-label="テーマ"
        >
          <option value="system">システム{mounted && resolvedTheme ? `（${resolvedTheme === "dark" ? "ダーク" : "ライト"}）` : ""}</option>
          <option value="light">ライト</option>
          <option value="dark">ダーク</option>
        </select>
      </label>
    </div>
  );
}
