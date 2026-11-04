import { describe, expect, it } from "vitest";
import { openSqliteRepositories } from "./index";
import type { DailyBar } from "../types";

function bar(p: Partial<DailyBar> & { code: string; date: string; source: DailyBar["source"] }): DailyBar {
  return {
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1000,
    turnover: 105000,
    adjFactor: 1,
    adjOpen: 100,
    adjHigh: 110,
    adjLow: 90,
    adjClose: 105,
    adjVolume: 1000,
    upperLimit: false,
    lowerLimit: false,
    fetchedAt: "2026-10-29T00:00:00.000Z",
    ...p,
  };
}

describe("SqliteDailyBarRepository", () => {
  it("upsert と出所優先順位マージ（jquants > kabu > yahoo）", () => {
    const repos = openSqliteRepositories(":memory:");
    repos.dailyBars.upsertMany([
      bar({ code: "7203", date: "2026-01-05", source: "yahoo", close: 1 }),
      bar({ code: "7203", date: "2026-01-05", source: "kabu", close: 2 }),
      bar({ code: "7203", date: "2026-01-06", source: "yahoo", close: 3 }),
      bar({ code: "7203", date: "2026-01-06", source: "jquants", close: 4 }),
      bar({ code: "7203", date: "2026-01-07", source: "yahoo", close: 5 }),
      bar({ code: "8306", date: "2026-01-07", source: "jquants", close: 6 }),
    ]);
    const merged = repos.dailyBars.findMerged("7203");
    expect(merged.map((b) => [b.date, b.source, b.close])).toEqual([
      ["2026-01-05", "kabu", 2],
      ["2026-01-06", "jquants", 4],
      ["2026-01-07", "yahoo", 5],
    ]);
    expect(repos.dailyBars.findMerged("7203", { from: "2026-01-06" })).toHaveLength(2);
    expect(repos.dailyBars.findMerged("7203", { to: "2026-01-05" })).toHaveLength(1);
    expect(repos.dailyBars.findBySource("7203", "yahoo")).toHaveLength(3);
    expect(repos.dailyBars.findMergedByDate("2026-01-07").map((b) => b.code)).toEqual(["7203", "8306"]);
    const latest = repos.dailyBars.findLatestMerged(["7203", "8306", "9999"]);
    expect(latest.get("7203")?.close).toBe(5);
    expect(latest.get("8306")?.close).toBe(6);
    expect(latest.has("9999")).toBe(false);

    // 上書き
    repos.dailyBars.upsertMany([bar({ code: "7203", date: "2026-01-05", source: "kabu", close: 22 })]);
    expect(repos.dailyBars.findMerged("7203", { to: "2026-01-05" })[0].close).toBe(22);
    expect(repos.dailyBars.count()).toBe(6);

    const cov = repos.dailyBars.coverageBySource();
    expect(cov.map((c) => c.source)).toEqual(["jquants", "kabu", "yahoo"]);
    expect(cov.find((c) => c.source === "yahoo")).toMatchObject({ rows: 3, codes: 1, minDate: "2026-01-05", maxDate: "2026-01-07" });
    const byCode = repos.dailyBars.coverageByCode(["7203"]);
    expect(byCode).toHaveLength(1);
    expect(byCode[0].sources.sort()).toEqual(["jquants", "kabu", "yahoo"]);
    repos.close();
  });

  it("ストップ高安フラグの null を保持", () => {
    const repos = openSqliteRepositories(":memory:");
    repos.dailyBars.upsertMany([bar({ code: "7203", date: "2026-01-05", source: "kabu", upperLimit: null, lowerLimit: true })]);
    const b = repos.dailyBars.findMerged("7203")[0];
    expect(b.upperLimit).toBeNull();
    expect(b.lowerLimit).toBe(true);
    repos.close();
  });
});

describe("Calendar / FetchProgress / Meta / FinSummary", () => {
  it("calendar businessDays は休日区分 1,2 のみ", () => {
    const repos = openSqliteRepositories(":memory:");
    repos.calendar.upsertMany([
      { date: "2026-01-01", holDiv: "0" },
      { date: "2026-01-05", holDiv: "1" },
      { date: "2026-01-06", holDiv: "2" },
      { date: "2026-01-12", holDiv: "3" },
    ]);
    expect(repos.calendar.businessDays({ from: "2026-01-01", to: "2026-01-31" })).toEqual(["2026-01-05", "2026-01-06"]);
    expect(repos.calendar.coverage()).toEqual({ minDate: "2026-01-01", maxDate: "2026-01-12", rows: 4 });
    repos.close();
  });

  it("fetchProgress の done/error と再開用キー", () => {
    const repos = openSqliteRepositories(":memory:");
    repos.fetchProgress.set({ job: "j", key: "2026-01-05", status: "done", rows: 10 });
    repos.fetchProgress.set({ job: "j", key: "2026-01-06", status: "error", message: "429" });
    repos.fetchProgress.set({ job: "j", key: "2026-01-07", status: "done", rows: 3 });
    expect(repos.fetchProgress.listDone("j")).toEqual(["2026-01-05", "2026-01-07"]);
    expect(repos.fetchProgress.lastDoneKey("j")).toBe("2026-01-07");
    expect(repos.fetchProgress.summary("j")).toMatchObject({ done: 2, error: 1 });
    expect(repos.fetchProgress.get("j", "2026-01-06")?.message).toBe("429");
    repos.fetchProgress.set({ job: "j", key: "2026-01-06", status: "done", rows: 1 });
    expect(repos.fetchProgress.summary("j")).toMatchObject({ done: 3, error: 0 });
    expect(repos.fetchProgress.clear("j", ["2026-01-05"])).toBe(1);
    expect(repos.fetchProgress.clear("j")).toBe(2);
    expect(repos.fetchProgress.lastDoneKey("j")).toBeNull();
    repos.close();
  });

  it("meta と finSummaries", () => {
    const repos = openSqliteRepositories(":memory:");
    repos.meta.set("k", "v");
    repos.meta.set("k", "v2");
    expect(repos.meta.get("k")).toBe("v2");
    expect(repos.meta.all()).toEqual({ k: "v2" });

    const base = {
      code: "7203",
      discTime: "13:00:00",
      docType: "FYFinancialStatements_Consolidated_IFRS",
      curPerType: "FY",
      curFyStart: "2025-04-01",
      curFyEnd: "2026-03-31",
      treasuryShares: 1,
      avgShares: 1,
      eps: 1,
      bps: 1,
      sales: 1,
      operatingProfit: 1,
      ordinaryProfit: null,
      netProfit: 1,
      raw: "{}",
      fetchedAt: "2026-10-29T00:00:00.000Z",
    };
    repos.finSummaries.upsertMany([
      { ...base, discDate: "2025-05-08", sharesOutstanding: 100 },
      { ...base, discDate: "2026-05-08", sharesOutstanding: null },
      { ...base, discDate: "2026-02-05", docType: "3QFinancialStatements_Consolidated_IFRS", curPerType: "3Q", sharesOutstanding: 90 },
    ]);
    expect(repos.finSummaries.count()).toBe(3);
    expect(repos.finSummaries.findByCode("7203").map((f) => f.discDate)).toEqual(["2025-05-08", "2026-02-05", "2026-05-08"]);
    expect(repos.finSummaries.latestByCode("7203")?.sharesOutstanding).toBe(90);
    repos.close();
  });
});
