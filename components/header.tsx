import Link from "next/link";
import { HeaderControls } from "./header-controls";

const NAV: { href: "/" | "/morning" | "/backtest" | "/collector"; label: string }[] = [
  { href: "/", label: "ダッシュボード" },
  { href: "/morning", label: "寄り前" },
  { href: "/backtest", label: "バックテスト" },
  { href: "/collector", label: "収集状況" },
];

export function Header() {
  return (
    <header className="border-b border-border bg-panel">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-wide">
          寄りラボ <span className="text-xs font-normal text-muted">Yori Lab</span>
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-accent">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <HeaderControls />
        </div>
      </div>
    </header>
  );
}
