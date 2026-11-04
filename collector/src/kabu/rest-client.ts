import { toKabuSymbol } from "@/lib/codes";
import { RateLimiter } from "@/lib/jquants/rate-limiter";
import type { KabuBoard, KabuErrorResponse, KabuRegisterResponse, KabuTimeAndSalesResponse, KabuTokenResponse } from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface KabuRestClientOptions {
  baseUrl: string;
  apiPassword: string;
  fetch?: FetchLike;
  logger?: (msg: string) => void;
}

export class KabuApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | null,
    message: string,
  ) {
    super(`kabu API ${status}${code !== null ? ` (${code})` : ""}: ${message}`);
    this.name = "KabuApiError";
  }
}

/**
 * kabuステーション REST API クライアント（http://localhost:18080/kabusapi）。
 * - 認証: POST /token {APIPassword} → Token。以後 X-API-KEY ヘッダー
 * - 流量制限（公式）: 情報系 約10件/秒、歩み値 2件/秒
 * - トークンは kabuステーションの終了・ログアウト・再発行で失効し、毎朝 6:15 に強制ログアウトされる
 */
export class KabuRestClient {
  private token: string | null = null;
  private readonly fetchImpl: FetchLike;
  private readonly log: (msg: string) => void;
  private readonly infoLimiter = new RateLimiter({ maxRequests: 8, windowMs: 1000, marginMs: 50, spread: false });
  private readonly tsLimiter = new RateLimiter({ maxRequests: 2, windowMs: 1000, marginMs: 50, spread: true });

  constructor(private readonly opts: KabuRestClientOptions) {
    this.fetchImpl = opts.fetch ?? ((i, init) => fetch(i, init));
    this.log = opts.logger ?? (() => undefined);
  }

  hasToken(): boolean {
    return this.token !== null;
  }

  private url(path: string): string {
    return this.opts.baseUrl.replace(/\/$/, "") + path;
  }

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) {
      if (!this.token) throw new KabuApiError(401, null, "token not issued (call authenticate first)");
      headers["X-API-KEY"] = this.token;
    }
    const res = await this.fetchImpl(this.url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = json as KabuErrorResponse | null;
      throw new KabuApiError(res.status, err?.Code ?? null, err?.Message ?? text.slice(0, 200));
    }
    return json as T;
  }

  /** トークン発行。失敗時は例外 */
  async authenticate(): Promise<void> {
    const r = await this.request<KabuTokenResponse>("POST", "/token", { APIPassword: this.opts.apiPassword }, false);
    if (r.ResultCode !== 0 || !r.Token) throw new KabuApiError(200, r.ResultCode, "token issue failed");
    this.token = r.Token;
    this.log("kabu: token issued");
  }

  async register(codes: string[], exchange = 1): Promise<string[]> {
    await this.infoLimiter.acquire();
    const r = await this.request<KabuRegisterResponse>("PUT", "/register", { Symbols: codes.map((c) => ({ Symbol: c, Exchange: exchange })) });
    return (r.RegistList ?? []).map((s) => s.Symbol);
  }

  async unregisterAll(): Promise<void> {
    await this.infoLimiter.acquire();
    await this.request<unknown>("PUT", "/unregister/all");
  }

  async board(code: string, exchange = 1): Promise<KabuBoard> {
    await this.infoLimiter.acquire();
    return this.request<KabuBoard>("GET", `/board/${encodeURIComponent(toKabuSymbol(code, exchange))}`);
  }

  async timeAndSales(code: string, exchange = 1): Promise<KabuTimeAndSalesResponse> {
    await this.tsLimiter.acquire();
    return this.request<KabuTimeAndSalesResponse>("GET", `/timeandsales/${encodeURIComponent(toKabuSymbol(code, exchange))}`);
  }
}
