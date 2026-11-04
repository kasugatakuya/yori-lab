"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

/** 騰落の色の慣習: jp = 上昇赤・下落緑、intl = 上昇緑・下落赤 */
export type UpDownConvention = "jp" | "intl";

interface Settings {
  upDown: UpDownConvention;
  setUpDown: (v: UpDownConvention) => void;
}

const SettingsContext = createContext<Settings | null>(null);
const STORAGE_KEY = "yori-lab:updown";
const listeners = new Set<() => void>();

function readStored(): UpDownConvention {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "intl" ? "intl" : "jp";
  } catch {
    return "jp";
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // サーバー側は常に "jp"。クライアントでは localStorage の値を外部ストアとして読む
  const upDown = useSyncExternalStore(subscribe, readStored, () => "jp" as UpDownConvention);

  useEffect(() => {
    document.documentElement.dataset.updown = upDown;
  }, [upDown]);

  const setUpDown = useCallback((v: UpDownConvention) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* localStorage 不可でも動作させる */
    }
    for (const l of listeners) l();
  }, []);

  const value = useMemo(() => ({ upDown, setUpDown }), [upDown, setUpDown]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
