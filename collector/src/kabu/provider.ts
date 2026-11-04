import { normalizeCode } from "@/lib/codes";
import type { BoardProvider, NormalizedBoard, ProviderStatus, TimeAndSalesEntry } from "../provider";
import { nowJstIso } from "../time";
import { normalizeKabuBoard } from "./normalize";
import { KabuPushClient } from "./push-client";
import { KabuRestClient } from "./rest-client";
import type { KabuBoard } from "./types";

export interface KabuProviderOptions {
  baseUrl: string;
  wsUrl: string;
  apiPassword: string;
  depth?: number;
  logger?: (msg: string) => void;
  rest?: KabuRestClient;
  push?: KabuPushClient;
}

/** kabuステーションAPI（三菱UFJ eスマート証券）の BoardProvider 実装 */
export class KabuStationProvider implements BoardProvider {
  readonly name = "kabu-station";
  /** 公式: API登録銘柄リストは REST/PUSH 合算で最大50銘柄 */
  readonly maxSymbols = 50;
  private readonly rest: KabuRestClient;
  private readonly push: KabuPushClient;
  private readonly depth: number;
  private boardHandlers = new Set<(b: NormalizedBoard) => void>();
  private statusHandlers = new Set<(s: ProviderStatus) => void>();
  private connected = false;

  constructor(opts: KabuProviderOptions) {
    this.depth = opts.depth ?? 10;
    this.rest = opts.rest ?? new KabuRestClient({ baseUrl: opts.baseUrl, apiPassword: opts.apiPassword, logger: opts.logger });
    this.push = opts.push ?? new KabuPushClient({ url: opts.wsUrl, logger: opts.logger });
    this.push.on((e) => {
      switch (e.type) {
        case "open":
          this.connected = true;
          this.emitStatus({ type: "connected" });
          break;
        case "close":
          this.connected = false;
          this.emitStatus({ type: "disconnected", reason: `${e.code} ${e.reason}` });
          break;
        case "reconnecting":
          this.emitStatus({ type: "reconnecting", attempt: e.attempt, delayMs: e.delayMs });
          break;
        case "error":
          this.emitStatus({ type: "error", message: e.message });
          break;
        case "message": {
          const raw = e.data as KabuBoard;
          if (!raw || typeof raw !== "object" || typeof raw.Symbol !== "string") return;
          const board = normalizeKabuBoard(raw, nowJstIso(new Date(e.receivedAt)), this.depth);
          for (const h of this.boardHandlers) h(board);
          break;
        }
      }
    });
  }

  private emitStatus(s: ProviderStatus) {
    for (const h of this.statusHandlers) h(s);
  }

  async authenticate(): Promise<void> {
    await this.rest.authenticate();
  }

  async connect(): Promise<void> {
    if (!this.rest.hasToken()) await this.rest.authenticate();
    this.push.connect();
  }

  async disconnect(): Promise<void> {
    this.push.close();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.push.isOpen();
  }

  async registerSymbols(codes: string[]): Promise<string[]> {
    const unique = [...new Set(codes.map(normalizeCode))].slice(0, this.maxSymbols);
    const registered = await this.rest.register(unique);
    return registered.map(normalizeCode);
  }

  async unregisterAll(): Promise<void> {
    await this.rest.unregisterAll();
  }

  async fetchBoard(code: string): Promise<NormalizedBoard> {
    const raw = await this.rest.board(code);
    return normalizeKabuBoard(raw, nowJstIso(), this.depth);
  }

  async fetchTimeAndSales(code: string): Promise<TimeAndSalesEntry[]> {
    const r = await this.rest.timeAndSales(code);
    return (r.TradingPrice ?? []).map((t) => ({ time: t.Time, price: t.Price, volume: t.Volume }));
  }

  onBoard(handler: (board: NormalizedBoard) => void): () => void {
    this.boardHandlers.add(handler);
    return () => this.boardHandlers.delete(handler);
  }

  onStatus(handler: (status: ProviderStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }
}
