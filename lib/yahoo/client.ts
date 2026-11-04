import { normalizeCode } from "@/lib/codes";
import type { DailyBar, MinuteBar } from "@/lib/db/types";

/**
 * Yahoo Finance 非公式チャート API（任意・補完用）。
 *   https://query1.finance.yahoo.com/v8/finance/chart/{code}.T?interval=5m&range=5d
 * 非公式のため仕様変更や拒否（429）があり得る。失敗しても呼び出し側は続行できるよう、例外は YahooError に包む。
 * 取得値は精度・訂正の保証がないため、出所 yahoo として区別し、J-Quants / kabu より優先度を下げる。
 */
export class YahooError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "YahooError";
  }
}

interface ChartResponse {
  chart?: {
    result?: {
      meta?: { gmtoffset?: number; exchangeTimezoneName?: string; dataGranularity?: string };
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface YahooClientOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  userAgent?: string;
}

const JST_MS = 9 * 3600_000;

function jstIso(sec: number): string {
  return `${new Date(sec * 1000 + JST_MS).toISOString().slice(0, 19)}+09:00`;
}

export class YahooClient {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly ua: string;
  constructor(opts: YahooClientOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((i, init) => fetch(i, init));
    this.baseUrl = opts.baseUrl ?? "https://query1.finance.yahoo.com/v8/finance/chart";
    this.ua = opts.userAgent ?? "Mozilla/5.0";
  }

  private async chart(code: string, interval: string, range: string) {
    const url = `${this.baseUrl}/${encodeURIComponent(normalizeCode(code))}.T?interval=${interval}&range=${range}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { "user-agent": this.ua, accept: "application/json" } });
    } catch (e) {
      throw new YahooError(`network error: ${(e as Error).message}`);
    }
    if (!res.ok) throw new YahooError(`HTTP ${res.status} for ${code}`, res.status);
    const json = (await res.json()) as ChartResponse;
    const r = json.chart?.result?.[0];
    if (!r || !r.timestamp || !r.indicators?.quote?.[0]) throw new YahooError(`unexpected response for ${code}: ${json.chart?.error?.description ?? "no result"}`);
    return r;
  }

  /** 日足（直近 range。既定 3ヶ月） */
  async dailyBars(code: string, range = "3mo", fetchedAt = new Date().toISOString()): Promise<DailyBar[]> {
    const r = await this.chart(code, "1d", range);
    const q = r.indicators!.quote![0];
    const out: DailyBar[] = [];
    r.timestamp!.forEach((t, i) => {
      const o = q.open?.[i] ?? null;
      const h = q.high?.[i] ?? null;
      const l = q.low?.[i] ?? null;
      const c = q.close?.[i] ?? null;
      const v = q.volume?.[i] ?? null;
      if (o === null || h === null || l === null || c === null) return;
      const date = new Date(t * 1000 + JST_MS).toISOString().slice(0, 10);
      out.push({
        code: normalizeCode(code),
        date,
        source: "yahoo",
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
        turnover: null,
        adjFactor: null,
        adjOpen: null,
        adjHigh: null,
        adjLow: null,
        adjClose: null,
        adjVolume: null,
        upperLimit: null,
        lowerLimit: null,
        fetchedAt,
      });
    });
    return out;
  }

  /** 5分足（直近 range。既定 5日）。バー開始時刻は JST の ISO */
  async fiveMinuteBars(code: string, range = "5d"): Promise<MinuteBar[]> {
    const r = await this.chart(code, "5m", range);
    const q = r.indicators!.quote![0];
    const out: MinuteBar[] = [];
    r.timestamp!.forEach((t, i) => {
      const o = q.open?.[i] ?? null;
      const h = q.high?.[i] ?? null;
      const l = q.low?.[i] ?? null;
      const c = q.close?.[i] ?? null;
      if (o === null || h === null || l === null || c === null) return;
      const ts = jstIso(t);
      out.push({ code: normalizeCode(code), tradeDate: ts.slice(0, 10), intervalMin: 5, ts, open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? null, source: "yahoo" });
    });
    return out;
  }
}
