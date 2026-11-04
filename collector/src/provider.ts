/**
 * 証券会社 API を差し替えるためのインターフェース。
 * KabuStationProvider（kabuステーションAPI）を最初の実装とし、立花証券 e支店 API などは後から追加できる。
 */

export interface QuoteLevel {
  price: number | null;
  qty: number | null;
}

export interface BestQuote extends QuoteLevel {
  /** 気配種別コード（kabu: 0101 一般気配, 0107 寄前気配, 0118 連続約定気配 など） */
  sign: string | null;
  time: string | null;
}

/** 証券会社に依存しない板・時価の正規化形式 */
export interface NormalizedBoard {
  /** 4桁コード */
  code: string;
  exchange: number;
  /** 受信時刻（ISO8601、JST オフセット付き） */
  receivedAt: string;
  currentPrice: number | null;
  currentPriceTime: string | null;
  currentPriceChangeStatus: string | null;
  /** 計算用現値（寄り前は気配から計算された価格） */
  calcPrice: number | null;
  previousClose: number | null;
  openingPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  /** 累計出来高 */
  tradingVolume: number | null;
  tradingValue: number | null;
  vwap: number | null;
  /** 最良売り気配（Ask） */
  bestAsk: BestQuote;
  /** 最良買い気配（Bid） */
  bestBid: BestQuote;
  /** 売り気配（安い順、1本目 = 最良） */
  asks: QuoteLevel[];
  /** 買い気配（高い順、1本目 = 最良） */
  bids: QuoteLevel[];
  marketSellQty: number | null;
  marketBuyQty: number | null;
  overSellQty: number | null;
  underBuyQty: number | null;
  totalMarketValue: number | null;
}

export interface TimeAndSalesEntry {
  time: string;
  price: number;
  volume: number;
}

export type ProviderStatus =
  | { type: "connected" }
  | { type: "disconnected"; reason: string }
  | { type: "reconnecting"; attempt: number; delayMs: number }
  | { type: "error"; message: string };

export interface BoardProvider {
  readonly name: string;
  /** 同時に購読できる銘柄数の上限（kabu: 50） */
  readonly maxSymbols: number;
  /** 認証・接続の準備（kabu: トークン発行）。毎朝呼び直せる */
  authenticate(): Promise<void>;
  /** PUSH 配信を開始する */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  /** 購読銘柄を登録し、実際に登録できた銘柄を返す */
  registerSymbols(codes: string[]): Promise<string[]>;
  unregisterAll(): Promise<void>;
  /** REST で板・時価を1回取得する */
  fetchBoard(code: string): Promise<NormalizedBoard>;
  /** 歩み値（対応していなければ undefined） */
  fetchTimeAndSales?(code: string): Promise<TimeAndSalesEntry[]>;
  onBoard(handler: (board: NormalizedBoard) => void): () => void;
  onStatus(handler: (status: ProviderStatus) => void): () => void;
}
