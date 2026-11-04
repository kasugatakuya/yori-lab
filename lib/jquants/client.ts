import { toCompactYmd } from "@/lib/dates";
import { toJQuantsCode } from "@/lib/codes";
import { RateLimiter } from "./rate-limiter";
import type { JQuantsEnvelope, RawCalendarDay, RawDailyBar, RawFinSummary, RawMasterRow, RawValuationRow } from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface JQuantsClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** 1分あたりの上限（プラン共通枠）。Free=5 */
  ratePerMinute?: number;
  /** /v2/fins/summary 専用枠（プランに関わらず 60/分）。公式: /ja/spec/rate-limits */
  finsRatePerMinute?: number;
  rateLimiter?: RateLimiter;
  finsRateLimiter?: RateLimiter;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** 429/5xx のリトライ回数 */
  maxRetries?: number;
  /** 429 時の待機時間（Retry-After が無い場合）。公式推奨は 1〜2 分。既定 120 秒 */
  retryAfter429Ms?: number;
  logger?: (msg: string) => void;
}

export class JQuantsHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`J-Quants HTTP ${status}: ${url} ${body.slice(0, 200)}`);
    this.name = "JQuantsHttpError";
  }
}

export type DailyBarsQuery = { date: string } | { code: string; from?: string; to?: string; date?: string };
export type FinSummaryQuery = { code: string; date?: string } | { date: string };

/**
 * J-Quants API V2 クライアント。
 * - 認証: x-api-key ヘッダー（Authorization と併用不可）
 * - レート制限: RateLimiter で送信前に待機。429 は待って再試行
 * - ページング: pagination_key が無くなるまで同一条件で再リクエストし data を連結
 */
export class JQuantsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly finsLimiter: RateLimiter;
  private readonly retryAfter429Ms: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly log: (msg: string) => void;
  /** 送信したHTTPリクエスト数（ページング・リトライ含む） */
  requestCount = 0;

  constructor(opts: JQuantsClientOptions) {
    if (!opts.apiKey) throw new Error("JQUANTS_API_KEY is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.jquants.com").replace(/\/$/, "");
    this.limiter = opts.rateLimiter ?? new RateLimiter({ maxRequests: opts.ratePerMinute ?? 5 });
    this.finsLimiter = opts.finsRateLimiter ?? new RateLimiter({ maxRequests: opts.finsRatePerMinute ?? 60 });
    this.retryAfter429Ms = opts.retryAfter429Ms ?? 120_000;
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 5;
    this.log = opts.logger ?? (() => undefined);
  }

  /** 全ページを取得して data を連結する */
  async getAll<T>(path: string, params: Record<string, string | undefined>): Promise<T[]> {
    const out: T[] = [];
    let paginationKey: string | undefined;
    let page = 0;
    do {
      const body = await this.getPage<T>(path, { ...params, pagination_key: paginationKey });
      out.push(...body.data);
      paginationKey = body.pagination_key;
      page++;
      if (paginationKey) this.log(`${path}: page ${page} done (${out.length} rows so far), continuing`);
    } while (paginationKey);
    return out;
  }

  private buildUrl(path: string, params: Record<string, string | undefined>): string {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
    return url.toString();
  }

  private limiterFor(path: string): RateLimiter {
    return path.startsWith("/v2/fins/summary") || path.startsWith("/v2/fins/details") ? this.finsLimiter : this.limiter;
  }

  private async getPage<T>(path: string, params: Record<string, string | undefined>): Promise<JQuantsEnvelope<T>> {
    const url = this.buildUrl(path, params);
    const limiter = this.limiterFor(path);
    let attempt = 0;
    for (;;) {
      await limiter.acquire();
      this.requestCount++;
      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers: { "x-api-key": this.apiKey, accept: "application/json" } });
      } catch (e) {
        if (attempt >= this.maxRetries) throw e;
        attempt++;
        const wait = Math.min(60_000, 2_000 * 2 ** attempt);
        this.log(`network error (${(e as Error).message}); retry ${attempt}/${this.maxRetries} after ${wait}ms`);
        await this.sleep(wait);
        continue;
      }
      if (res.ok) {
        const json = (await res.json()) as JQuantsEnvelope<T> | { data?: unknown };
        if (!json || !Array.isArray((json as JQuantsEnvelope<T>).data)) {
          throw new Error(`J-Quants unexpected response shape for ${path}`);
        }
        return json as JQuantsEnvelope<T>;
      }
      const text = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.maxRetries) throw new JQuantsHttpError(res.status, url, text);
      attempt++;
      const retryAfter = Number(res.headers.get("retry-after"));
      if (res.status === 429) limiter.penalize();
      const wait =
        res.status === 429
          ? Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : this.retryAfter429Ms
          : Math.min(60_000, 2_000 * 2 ** attempt);
      this.log(`HTTP ${res.status}; retry ${attempt}/${this.maxRetries} after ${wait}ms`);
      await this.sleep(wait);
    }
  }

  // ---- endpoints ----

  /** 株価四本値。date のみ指定で全銘柄一括 */
  getDailyBars(q: DailyBarsQuery): Promise<RawDailyBar[]> {
    const params: Record<string, string | undefined> = {};
    if ("code" in q) {
      params.code = toJQuantsCode(q.code);
      if (q.from) params.from = toCompactYmd(q.from);
      if (q.to) params.to = toCompactYmd(q.to);
      if (q.date) params.date = toCompactYmd(q.date);
    } else {
      params.date = toCompactYmd(q.date);
    }
    return this.getAll<RawDailyBar>("/v2/equities/bars/daily", params);
  }

  /** 取引カレンダー */
  getCalendar(q: { from?: string; to?: string; holDiv?: string } = {}): Promise<RawCalendarDay[]> {
    return this.getAll<RawCalendarDay>("/v2/markets/calendar", {
      from: q.from ? toCompactYmd(q.from) : undefined,
      to: q.to ? toCompactYmd(q.to) : undefined,
      hol_div: q.holDiv,
    });
  }

  /** 財務情報（サマリー） */
  getFinSummary(q: FinSummaryQuery): Promise<RawFinSummary[]> {
    const params: Record<string, string | undefined> = {};
    if ("code" in q) params.code = toJQuantsCode(q.code);
    if (q.date) params.date = toCompactYmd(q.date);
    return this.getAll<RawFinSummary>("/v2/fins/summary", params);
  }

  /** バリュエーション指標（時価総額 MktCap を含む）。date のみ指定で全銘柄 */
  getValuation(q: { code?: string; date?: string } = {}): Promise<RawValuationRow[]> {
    return this.getAll<RawValuationRow>("/v2/equities/valuation", {
      code: q.code ? toJQuantsCode(q.code) : undefined,
      date: q.date ? toCompactYmd(q.date) : undefined,
    });
  }

  /** 上場銘柄一覧 */
  getMaster(q: { code?: string; date?: string } = {}): Promise<RawMasterRow[]> {
    return this.getAll<RawMasterRow>("/v2/equities/master", {
      code: q.code ? toJQuantsCode(q.code) : undefined,
      date: q.date ? toCompactYmd(q.date) : undefined,
    });
  }
}
