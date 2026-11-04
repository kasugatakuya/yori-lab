import type { BoardProvider, NormalizedBoard, ProviderStatus, QuoteLevel, TimeAndSalesEntry } from "../provider";
import { jstSecondsOfDay, nowJstIso, parseHms } from "../time";

export interface MockProviderOptions {
  /** 配信間隔（実時間 ms）。kabu の間引きは 400ms */
  tickMs?: number;
  /** 寄り付き時刻（JST, "09:00"）。この前は寄前気配のみ配信 */
  openAt?: string;
  closeAt?: string;
  /** 現在時刻の供給（シミュレーション用） */
  clock?: () => Date;
  seed?: number;
}

/**
 * 開発・容量見積もり用のモック。kabuステーションなしで PUSH 相当の板を生成する。
 * 寄り前は寄前気配（Sign 0107）を、寄り後はランダムウォークの約定と板を流す。
 */
export class MockBoardProvider implements BoardProvider {
  readonly name = "mock";
  readonly maxSymbols = 50;
  private symbols: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private boardHandlers = new Set<(b: NormalizedBoard) => void>();
  private statusHandlers = new Set<(s: ProviderStatus) => void>();
  private state = new Map<string, { price: number; prevClose: number; volume: number; open: number | null; high: number | null; low: number | null }>();
  private seed: number;
  private readonly tickMs: number;
  private readonly openSec: number;
  private readonly closeSec: number;
  private readonly clock: () => Date;
  private connected = false;

  constructor(opts: MockProviderOptions = {}) {
    this.tickMs = opts.tickMs ?? 400;
    this.openSec = parseHms(opts.openAt ?? "09:00");
    this.closeSec = parseHms(opts.closeAt ?? "15:30");
    this.clock = opts.clock ?? (() => new Date());
    this.seed = opts.seed ?? 42;
  }

  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
    return this.seed / 2147483648;
  }

  async authenticate(): Promise<void> {}

  async connect(): Promise<void> {
    this.connected = true;
    for (const h of this.statusHandlers) h({ type: "connected" });
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.connected = false;
    for (const h of this.statusHandlers) h({ type: "disconnected", reason: "client close" });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async registerSymbols(codes: string[]): Promise<string[]> {
    this.symbols = codes.slice(0, this.maxSymbols);
    for (const c of this.symbols) {
      if (!this.state.has(c)) {
        const prevClose = Math.round(500 + this.rand() * 9500);
        this.state.set(c, { price: prevClose, prevClose, volume: 0, open: null, high: null, low: null });
      }
    }
    return [...this.symbols];
  }

  async unregisterAll(): Promise<void> {
    this.symbols = [];
  }

  async fetchBoard(code: string): Promise<NormalizedBoard> {
    return this.generate(code, this.clock());
  }

  async fetchTimeAndSales(): Promise<TimeAndSalesEntry[]> {
    return [];
  }

  onBoard(handler: (board: NormalizedBoard) => void): () => void {
    this.boardHandlers.add(handler);
    return () => this.boardHandlers.delete(handler);
  }

  onStatus(handler: (status: ProviderStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private tick(): void {
    const now = this.clock();
    for (const code of this.symbols) {
      // 毎ティック全銘柄が更新されるわけではない（約6割）
      if (this.rand() < 0.4) continue;
      const b = this.generate(code, now);
      for (const h of this.boardHandlers) h(b);
    }
  }

  private generate(code: string, now: Date): NormalizedBoard {
    const st = this.state.get(code) ?? { price: 1000, prevClose: 1000, volume: 0, open: null, high: null, low: null };
    this.state.set(code, st);
    const sec = jstSecondsOfDay(now);
    const tick = st.price >= 5000 ? 10 : st.price >= 3000 ? 5 : 1;
    const preOpen = sec < this.openSec;
    const afterClose = sec >= this.closeSec;
    if (preOpen) {
      // 寄前気配: 前日終値の周りで気配が揺れる
      st.price = Math.round((st.prevClose * (1 + (this.rand() - 0.5) * 0.01)) / tick) * tick;
    } else if (!afterClose) {
      const drift = (this.rand() - 0.5) * 2 * tick;
      st.price = Math.max(tick, Math.round((st.price + drift) / tick) * tick);
      const qty = Math.round(100 * (1 + Math.floor(this.rand() * 20)));
      if (this.rand() < 0.7) st.volume += qty;
      if (st.open === null) {
        st.open = st.price;
        st.high = st.price;
        st.low = st.price;
        st.volume += 10000;
      }
      st.high = Math.max(st.high ?? st.price, st.price);
      st.low = Math.min(st.low ?? st.price, st.price);
    }
    const mk = (base: number, dir: 1 | -1): QuoteLevel[] =>
      Array.from({ length: 10 }, (_, i) => ({ price: base + dir * tick * i, qty: Math.round(100 * (1 + Math.floor(this.rand() * 50))) }));
    const askBase = preOpen ? st.price : st.price + tick;
    const bidBase = st.price;
    const asks = mk(askBase, 1);
    const bids = mk(bidBase, -1);
    const sign = preOpen ? "0107" : "0101";
    return {
      code,
      exchange: 1,
      receivedAt: nowJstIso(now),
      currentPrice: preOpen ? null : st.price,
      currentPriceTime: preOpen ? null : nowJstIso(now),
      currentPriceChangeStatus: preOpen ? null : "0057",
      calcPrice: st.price,
      previousClose: st.prevClose,
      openingPrice: st.open,
      highPrice: st.high,
      lowPrice: st.low,
      tradingVolume: preOpen ? null : st.volume,
      tradingValue: preOpen ? null : st.volume * st.price,
      vwap: preOpen ? null : st.price,
      bestAsk: { price: asks[0].price, qty: asks[0].qty, sign, time: nowJstIso(now) },
      bestBid: { price: bids[0].price, qty: bids[0].qty, sign, time: nowJstIso(now) },
      asks,
      bids,
      marketSellQty: preOpen ? Math.round(this.rand() * 5000) : 0,
      marketBuyQty: preOpen ? Math.round(this.rand() * 5000) : 0,
      overSellQty: Math.round(this.rand() * 100000),
      underBuyQty: Math.round(this.rand() * 100000),
      totalMarketValue: null,
    };
  }
}
