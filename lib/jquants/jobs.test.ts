import { describe, expect, it } from "vitest";
import { openSqliteRepositories } from "@/lib/db";
import { JQuantsClient } from "./client";
import { RateLimiter } from "./rate-limiter";
import { JOB_DAILY, JOB_FINS, META_DAILY_LAST_DATE, ensureCalendar, resolveIncrementalFrom, runDailyFetch, runFinsFetch } from "./jobs";

function fastLimiter() {
  let t = 0;
  return new RateLimiter({ maxRequests: 1000, spread: false, now: () => t, sleep: async (ms) => void (t += ms) });
}

/** URL ごとのレスポンスを返す簡易モック */
function clientWith(handler: (url: URL) => { status: number; body: unknown }) {
  const calls: string[] = [];
  const fetchImpl = async (input: string): Promise<Response> => {
    const u = new URL(input);
    calls.push(u.pathname + u.search);
    const r = handler(u);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };
  const client = new JQuantsClient({
    apiKey: "k",
    fetch: fetchImpl,
    sleep: async () => undefined,
    rateLimiter: fastLimiter(),
    finsRateLimiter: fastLimiter(),
    maxRetries: 0,
  });
  return { client, calls };
}

const CAL = [
  { Date: "2026-01-04", HolDiv: "0" },
  { Date: "2026-01-05", HolDiv: "1" },
  { Date: "2026-01-06", HolDiv: "1" },
  { Date: "2026-01-07", HolDiv: "1" },
  { Date: "2026-01-08", HolDiv: "0" },
];

function barRow(code: string, date: string, close: number) {
  return { Date: date, Code: code, O: close, H: close, L: close, C: close, UL: "0", LL: "0", Vo: 1, Va: 1, AdjFactor: 1, AdjO: close, AdjH: close, AdjL: close, AdjC: close, AdjVo: 1 };
}

describe("ensureCalendar", () => {
  it("既存カレンダーが古い開始日を持っていても、要求範囲だけを取得する（Free プランの窓が日ごとにずれるため）", async () => {
    const repos = openSqliteRepositories(":memory:");
    // 前回取得時の窓: 2024-08-06..2026-08-06
    repos.calendar.upsertMany([
      { date: "2024-08-06", holDiv: "1" },
      { date: "2026-08-06", holDiv: "1" },
    ]);
    const { client, calls } = clientWith((u) => {
      if (u.pathname !== "/v2/markets/calendar") return { status: 404, body: {} };
      // 購読範囲外を要求したら J-Quants と同じく 400
      if (u.searchParams.get("from")! < "20240812") return { status: 400, body: { message: "Your subscription covers the following dates: 2024-08-12 ~ 2026-08-12." } };
      return { status: 200, body: { data: [{ Date: "2026-08-12", HolDiv: "1" }] } };
    });
    // 今日の窓: 2024-08-12..2026-08-12
    const n = await ensureCalendar(client, repos, { from: "2024-08-12", to: "2026-08-12" });
    expect(n).toBe(1);
    expect(calls).toEqual(["/v2/markets/calendar?from=20240812&to=20260812"]);
  });

  it("既存カレンダーが範囲を覆っていればリクエストしない", async () => {
    const repos = openSqliteRepositories(":memory:");
    repos.calendar.upsertMany([
      { date: "2026-01-01", holDiv: "0" },
      { date: "2026-01-31", holDiv: "1" },
    ]);
    const { client, calls } = clientWith(() => ({ status: 500, body: {} }));
    expect(await ensureCalendar(client, repos, { from: "2026-01-05", to: "2026-01-20" })).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("runDailyFetch", () => {
  it("カレンダー取得→営業日ごとに一括取得→universe だけ保存→進捗記録", async () => {
    const repos = openSqliteRepositories(":memory:");
    const { client, calls } = clientWith((u) => {
      if (u.pathname === "/v2/markets/calendar") return { status: 200, body: { data: CAL } };
      if (u.pathname === "/v2/equities/bars/daily") {
        const d = u.searchParams.get("date")!;
        const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        return { status: 200, body: { data: [barRow("72030", date, 100), barRow("99990", date, 1), barRow("83060", date, 200)] } };
      }
      return { status: 404, body: {} };
    });
    const logs: string[] = [];
    const res = await runDailyFetch(client, repos, { from: "2026-01-04", to: "2026-01-08", universeCodes: ["7203", "8306"], log: (m) => logs.push(m) });
    expect(res).toMatchObject({ businessDays: 3, fetchedDays: 3, skippedDays: 0, storedRows: 6, aborted: false, lastDate: "2026-01-07" });
    expect(calls.filter((c) => c.startsWith("/v2/markets/calendar"))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("/v2/equities/bars/daily"))).toHaveLength(3);
    expect(repos.dailyBars.findMerged("7203")).toHaveLength(3);
    expect(repos.dailyBars.findMerged("9999")).toHaveLength(0);
    expect(repos.fetchProgress.listDone(JOB_DAILY)).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
    expect(repos.meta.get(META_DAILY_LAST_DATE)).toBe("2026-01-07");

    // 2回目: すべてスキップ、API呼び出しなし
    const before = calls.length;
    const res2 = await runDailyFetch(client, repos, { from: "2026-01-04", to: "2026-01-08", universeCodes: ["7203"] });
    expect(res2).toMatchObject({ fetchedDays: 0, skippedDays: 3 });
    expect(calls.length).toBe(before);

    // 差分開始日
    expect(resolveIncrementalFrom(repos, "2025-01-01")).toBe("2026-01-08");
    expect(resolveIncrementalFrom(repos, "2026-02-01")).toBe("2026-02-01");
    repos.close();
  });

  it("途中でエラーになった日は error として記録し、次回に再取得される（再開）", async () => {
    const repos = openSqliteRepositories(":memory:");
    let fail = true;
    const { client } = clientWith((u) => {
      if (u.pathname === "/v2/markets/calendar") return { status: 200, body: { data: CAL } };
      const d = u.searchParams.get("date")!;
      if (d === "20260106" && fail) return { status: 500, body: {} };
      return { status: 200, body: { data: [barRow("72030", `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, 1)] } };
    });
    const r1 = await runDailyFetch(client, repos, { from: "2026-01-05", to: "2026-01-07", universeCodes: ["7203"] });
    expect(r1.fetchedDays).toBe(2);
    expect(r1.errors).toEqual([{ date: "2026-01-06", message: expect.stringContaining("500") }]);
    expect(repos.fetchProgress.get(JOB_DAILY, "2026-01-06")?.status).toBe("error");

    fail = false;
    const r2 = await runDailyFetch(client, repos, { from: "2026-01-05", to: "2026-01-07", universeCodes: ["7203"] });
    expect(r2).toMatchObject({ fetchedDays: 1, skippedDays: 2, errors: [] });
    expect(repos.dailyBars.findMerged("7203")).toHaveLength(3);
    repos.close();
  });

  it("maxDays で1回の処理量を制限でき、401/403 では中断する", async () => {
    const repos = openSqliteRepositories(":memory:");
    const { client } = clientWith((u) => {
      if (u.pathname === "/v2/markets/calendar") return { status: 200, body: { data: CAL } };
      return { status: 200, body: { data: [] } };
    });
    const r = await runDailyFetch(client, repos, { from: "2026-01-05", to: "2026-01-07", universeCodes: [], maxDays: 2 });
    expect(r.fetchedDays).toBe(2);

    const repos2 = openSqliteRepositories(":memory:");
    const bad = clientWith((u) => (u.pathname === "/v2/markets/calendar" ? { status: 200, body: { data: CAL } } : { status: 403, body: { message: "invalid or expired" } }));
    const r2 = await runDailyFetch(bad.client, repos2, { from: "2026-01-05", to: "2026-01-07", universeCodes: [] });
    expect(r2.aborted).toBe(true);
    expect(r2.errors).toHaveLength(1);
    repos.close();
    repos2.close();
  });

  it("from > to なら何もしない", async () => {
    const repos = openSqliteRepositories(":memory:");
    const { client, calls } = clientWith(() => ({ status: 200, body: { data: [] } }));
    const r = await runDailyFetch(client, repos, { from: "2026-01-08", to: "2026-01-07", universeCodes: [] });
    expect(r.businessDays).toBe(0);
    expect(calls).toHaveLength(0);
    repos.close();
  });
});

describe("runFinsFetch", () => {
  it("銘柄ごとに取得し進捗を記録、2回目はスキップ", async () => {
    const repos = openSqliteRepositories(":memory:");
    const { client, calls } = clientWith((u) => {
      const code = u.searchParams.get("code")!;
      return {
        status: 200,
        body: {
          data: [
            { DiscDate: "2026-05-08", DiscTime: "13:00:00", Code: code, DocType: "FY", CurPerType: "FY", ShOutFY: "100", EPS: "1.5" },
          ],
        },
      };
    });
    const r = await runFinsFetch(client, repos, { codes: ["7203", "8306"] });
    expect(r).toMatchObject({ codes: 2, fetched: 2, skipped: 0, storedRows: 2 });
    expect(calls).toEqual(["/v2/fins/summary?code=72030", "/v2/fins/summary?code=83060"]);
    expect(repos.finSummaries.latestByCode("7203")?.sharesOutstanding).toBe(100);
    const r2 = await runFinsFetch(client, repos, { codes: ["7203", "8306"] });
    expect(r2).toMatchObject({ fetched: 0, skipped: 2 });
    expect(repos.fetchProgress.listDone(JOB_FINS)).toEqual(["7203", "8306"]);
    repos.close();
  });
});
