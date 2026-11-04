import { describe, expect, it } from "vitest";
import { JQuantsClient, JQuantsHttpError } from "./client";
import { RateLimiter } from "./rate-limiter";

interface Call {
  url: string;
  headers: Record<string, string>;
}

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> } | Error>) {
  const calls: Call[] = [];
  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input, headers: (init?.headers as Record<string, string>) ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more mock responses");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json", ...(next.headers ?? {}) },
    });
  };
  return { calls, fetchImpl };
}

/** 時間が進む疑似クロック（sleep で now が進む）。penalize 後のループが終了するために必要 */
function fastLimiter() {
  let t = 0;
  const clock = {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
  return new RateLimiter({ maxRequests: 1000, spread: false, ...clock });
}

function makeClient(fetchImpl: ReturnType<typeof mockFetch>["fetchImpl"], sleeps: number[] = []) {
  return new JQuantsClient({
    apiKey: "key",
    fetch: fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    rateLimiter: fastLimiter(),
    finsRateLimiter: fastLimiter(),
    maxRetries: 2,
  });
}

describe("JQuantsClient", () => {
  it("x-api-key ヘッダーと date パラメータ（YYYYMMDD）を付ける", async () => {
    const m = mockFetch([{ status: 200, body: { data: [{ Date: "2026-01-05", Code: "72030" }] } }]);
    const c = makeClient(m.fetchImpl);
    const rows = await c.getDailyBars({ date: "2026-01-05" });
    expect(rows).toHaveLength(1);
    expect(m.calls[0].url).toBe("https://api.jquants.com/v2/equities/bars/daily?date=20260105");
    expect(m.calls[0].headers["x-api-key"]).toBe("key");
    expect(m.calls[0].headers.Authorization).toBeUndefined();
  });

  it("code は5桁に変換し from/to を付ける", async () => {
    const m = mockFetch([{ status: 200, body: { data: [] } }]);
    const c = makeClient(m.fetchImpl);
    await c.getDailyBars({ code: "7203", from: "2026-01-01", to: "2026-01-31" });
    expect(m.calls[0].url).toBe("https://api.jquants.com/v2/equities/bars/daily?code=72030&from=20260101&to=20260131");
  });

  it("pagination_key があれば同条件で続きを取得して連結", async () => {
    const m = mockFetch([
      { status: 200, body: { data: [{ Date: "d", Code: "1" }], pagination_key: "k1" } },
      { status: 200, body: { data: [{ Date: "d", Code: "2" }], pagination_key: "k2" } },
      { status: 200, body: { data: [{ Date: "d", Code: "3" }] } },
    ]);
    const c = makeClient(m.fetchImpl);
    const rows = await c.getAll<{ Date: string; Code: string }>("/v2/markets/calendar", { from: "20260101" });
    expect(rows.map((r) => r.Code)).toEqual(["1", "2", "3"]);
    expect(m.calls[1].url).toContain("pagination_key=k1");
    expect(m.calls[2].url).toContain("pagination_key=k2");
    expect(c.requestCount).toBe(3);
  });

  it("429 は待って再試行し、Retry-After を尊重する", async () => {
    const sleeps: number[] = [];
    const m = mockFetch([
      { status: 429, body: { message: "Too Many Requests" }, headers: { "retry-after": "7" } },
      { status: 200, body: { data: [] } },
    ]);
    const c = makeClient(m.fetchImpl, sleeps);
    await c.getFinSummary({ code: "7203" });
    expect(sleeps).toEqual([7000]);
    expect(m.calls).toHaveLength(2);
  });

  it("429 で Retry-After が無ければ既定の 120 秒待つ", async () => {
    const sleeps: number[] = [];
    const m = mockFetch([{ status: 429, body: {} }, { status: 200, body: { data: [] } }]);
    const c = makeClient(m.fetchImpl, sleeps);
    await c.getDailyBars({ date: "2026-01-05" });
    expect(sleeps).toEqual([120_000]);
  });

  it("リトライ上限を超えたら JQuantsHttpError", async () => {
    const m = mockFetch([
      { status: 500, body: {} },
      { status: 500, body: {} },
      { status: 500, body: {} },
    ]);
    const c = makeClient(m.fetchImpl);
    await expect(c.getMaster()).rejects.toBeInstanceOf(JQuantsHttpError);
  });

  it("403 は再試行しない", async () => {
    const m = mockFetch([{ status: 403, body: { message: "invalid or expired" } }]);
    const c = makeClient(m.fetchImpl);
    await expect(c.getMaster()).rejects.toMatchObject({ status: 403 });
    expect(m.calls).toHaveLength(1);
  });

  it("ネットワークエラーも再試行", async () => {
    const m = mockFetch([new Error("ECONNRESET"), { status: 200, body: { data: [] } }]);
    const c = makeClient(m.fetchImpl);
    await expect(c.getMaster()).resolves.toEqual([]);
  });
});
