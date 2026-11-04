"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { SettingsProvider } from "./settings-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SettingsProvider>{children}</SettingsProvider>
    </ThemeProvider>
  );
}
