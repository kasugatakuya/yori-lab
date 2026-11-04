import { describe, expect, it } from "vitest";
import { YahooClient, YahooError } from "./client";

const body = {
  chart: {
    result: [
      {
        meta: { gmtoffset: 32400 },
        timestamp: [1792713900, 1792714200],
        indicators: { quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, null], volume: [10, 20] }] },
      },
    ],
    error: null,
  },
};

describe("YahooClient", () => {
  it("5分足: JST のバー開始時刻、欠損バーは除く", async () => {
    const calls: string[] = [];
    const c = new YahooClient({ fetch: async (u) => (calls.push(u), new Response(JSON.stringify(body), { status: 200 })) });
    const bars = await c.fiveMinuteBars("7203");
    expect(calls[0]).toBe("https://query1.finance.yahoo.com/v8/finance/chart/7203.T?interval=5m&range=5d");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ code: "7203", tradeDate: "2026-10-23", ts: "2026-10-23T09:05:00+09:00", intervalMin: 5, source: "yahoo", open: 100, close: 101 });
  });
  it("日足: JST 日付、出所 yahoo、調整値なし", async () => {
    const c = new YahooClient({ fetch: async () => new Response(JSON.stringify(body), { status: 200 }) });
    const bars = await c.dailyBars("72030");
    expect(bars[0]).toMatchObject({ code: "7203", date: "2026-10-23", source: "yahoo", adjClose: null });
  });
  it("HTTP エラーは YahooError", async () => {
    const c = new YahooClient({ fetch: async () => new Response("rate limited", { status: 429 }) });
    await expect(c.dailyBars("7203")).rejects.toBeInstanceOf(YahooError);
    const c2 = new YahooClient({ fetch: async () => new Response(JSON.stringify({ chart: { result: null, error: { description: "No data" } } }), { status: 200 }) });
    await expect(c2.dailyBars("7203")).rejects.toThrow(/No data/);
  });
});
