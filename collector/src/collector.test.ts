import { describe, expect, it } from "vitest";
import { openSqliteRepositories } from "@/lib/db";
import { Collector, META_COLLECTOR_ALERT } from "./collector";
import { loadCollectorConfig } from "./config";
import { MockBoardProvider } from "./mock/provider";
import { jstDateTime, parseHms } from "./time";

/** 1日を数秒で流す疑似時計 */
function fastClock(ymd: string, fromHms: string, speed: number) {
  const start = jstDateTime(ymd, parseHms(fromHms)).getTime();
  const real0 = Date.now();
  return () => new Date(start + (Date.now() - real0) * speed);
}

describe("Collector（モックプロバイダで1日を高速再生）", () => {
  it("準備→記録→日足確定まで進み、スナップショット・約定・分足・セッション・日足が保存される", async () => {
    const repos = openSqliteRepositories(":memory:");
    const env = {
      COLLECTOR_START: "08:00",
      COLLECTOR_END: "08:06",
      COLLECTOR_DAILY_BAR_AT: "08:07",
      COLLECTOR_PREPARE_LEAD_SEC: "60",
      COLLECTOR_SNAPSHOT_INTERVAL_MS: "0",
      COLLECTOR_IDLE_GAP_SEC: "30",
      YORI_DB_PATH: ":memory:",
    } as unknown as NodeJS.ProcessEnv;
    const config = loadCollectorConfig(env);
    const speed = 200; // 8分 → 約2.4秒
    const clock = fastClock("2026-11-04", "07:58:30", speed);
    const provider = new MockBoardProvider({ tickMs: 10, clock, openAt: "08:03" });
    const logs: string[] = [];
    const c = new Collector({ provider, repos, config, symbols: ["7203", "8306", "6758"], log: (m) => logs.push(m), clock, tickMs: 10, once: true });
    await c.run();

    expect(logs.some((l) => l.includes("phase idle -> prepare"))).toBe(true);
    expect(logs.some((l) => l.includes("phase prepare -> recording"))).toBe(true);
    expect(logs.some((l) => l.includes("daily bars saved: 3/3"))).toBe(true);

    expect(repos.boardSnapshots.countByDate("2026-11-04")).toBeGreaterThan(50);
    expect(repos.trades.countByDate("2026-11-04")).toBeGreaterThan(10);
    expect(repos.minuteBars.find("7203", "2026-11-04", 1).length).toBeGreaterThan(0);
    expect(repos.minuteBars.find("7203", "2026-11-04", 5).length).toBeGreaterThan(0);
    const session = repos.collector.latestSession()!;
    expect(session.tradeDate).toBe("2026-11-04");
    expect(session.endedAt).not.toBeNull();
    expect(session.symbolCount).toBe(3);
    const bars = repos.dailyBars.findBySource("7203", "kabu");
    expect(bars).toHaveLength(1);
    expect(bars[0].open).not.toBeNull();
    expect(repos.collector.listDailyStats()[0]).toMatchObject({ tradeDate: "2026-11-04", symbols: 3 });
    const info = repos.boardDayInfo.get("2026-11-04", "7203");
    expect(info?.previousClose).not.toBeNull();
    expect(info?.openingPrice).not.toBeNull();
    expect(repos.boardDayInfo.latestDate()).toBe("2026-11-04");
    // 寄り前（08:00〜08:03）のスナップショットは現在値 null・寄前気配
    const snaps = repos.boardSnapshots.find("7203", "2026-11-04");
    const pre = snaps.filter((s) => s.currentPrice === null);
    expect(pre.length).toBeGreaterThan(0);
    expect(pre[0].bestAskSign).toBe("0107");
    // 約定の連番は 1 から連続
    const trades = repos.trades.find("7203", "2026-11-04");
    expect(trades.map((t) => t.seq)).toEqual(trades.map((_, i) => i + 1));
    repos.close();
  }, 30_000);

  it("接続できないと警告を meta に書き、休日は何もしない", async () => {
    const repos = openSqliteRepositories(":memory:");
    const config = loadCollectorConfig({ COLLECTOR_START: "08:00", COLLECTOR_END: "08:01", COLLECTOR_DAILY_BAR_AT: "08:02", COLLECTOR_PREPARE_LEAD_SEC: "30" } as unknown as NodeJS.ProcessEnv);
    class Broken extends MockBoardProvider {
      override async authenticate(): Promise<void> {
        throw new Error("token failed");
      }
      override isConnected(): boolean {
        return false;
      }
    }
    const clock = fastClock("2026-11-04", "07:59:40", 200);
    const logs: string[] = [];
    const c = new Collector({ provider: new Broken({ tickMs: 10, clock }), repos, config, symbols: ["7203"], log: (m) => logs.push(m), clock, tickMs: 10, once: true });
    await c.run();
    const alert = JSON.parse(repos.meta.get(META_COLLECTOR_ALERT) || "{}") as { message?: string };
    expect(logs.some((l) => l.includes("ALERT") && l.includes("接続できていません"))).toBe(true);
    expect(alert.message ?? logs.join("\n")).toMatch(/準備に失敗|接続できていません/);

    const logs2: string[] = [];
    const sunday = fastClock("2026-11-01", "07:59:40", 200);
    const c2 = new Collector({ provider: new MockBoardProvider({ tickMs: 10, clock: sunday }), repos, config, symbols: ["7203"], log: (m) => logs2.push(m), clock: sunday, tickMs: 10, once: true });
    await c2.run();
    expect(logs2.some((l) => l.includes("not a business day"))).toBe(true);
    expect(repos.collector.listSessions().filter((s) => s.tradeDate === "2026-11-01")).toHaveLength(0);
    repos.close();
  }, 30_000);
});
