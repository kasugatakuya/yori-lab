/**
 * ドメイン型。リポジトリ層の入出力はこの型で統一し、SQLite以外の実装に差し替えられるようにする。
 */

/** 日足の出所。優先順位は jquants > kabu > yahoo */
export type BarSource = "jquants" | "kabu" | "yahoo";
export const BAR_SOURCE_PRIORITY: readonly BarSource[] = ["jquants", "kabu", "yahoo"];

export interface DailyBar {
  code: string;
  /** YYYY-MM-DD */
  date: string;
  source: BarSource;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  /** 売買代金（円） */
  turnover: number | null;
  adjFactor: number | null;
  adjOpen: number | null;
  adjHigh: number | null;
  adjLow: number | null;
  adjClose: number | null;
  adjVolume: number | null;
  /** ストップ高 / ストップ安（不明は null） */
  upperLimit: boolean | null;
  lowerLimit: boolean | null;
  fetchedAt: string;
}

export interface CalendarDay {
  date: string;
  /** 0: 非営業日, 1: 営業日, 2: 東証半日立会日, 3: 非営業日(祝日取引あり) */
  holDiv: "0" | "1" | "2" | "3";
}

export function isTseBusinessDay(d: CalendarDay): boolean {
  return d.holDiv === "1" || d.holDiv === "2";
}

export interface FinSummary {
  code: string;
  discDate: string;
  discTime: string;
  docType: string;
  curPerType: string;
  curFyStart: string | null;
  curFyEnd: string | null;
  sharesOutstanding: number | null;
  treasuryShares: number | null;
  avgShares: number | null;
  eps: number | null;
  bps: number | null;
  sales: number | null;
  operatingProfit: number | null;
  ordinaryProfit: number | null;
  netProfit: number | null;
  /** APIの生レスポンス（JSON文字列）。項目追加に備えて保持する */
  raw: string;
  fetchedAt: string;
}

export type FetchStatus = "done" | "error";

export interface FetchProgress {
  job: string;
  key: string;
  status: FetchStatus;
  rows: number;
  message: string | null;
  updatedAt: string;
}

export interface SourceCoverage {
  source: BarSource;
  rows: number;
  codes: number;
  minDate: string | null;
  maxDate: string | null;
}

export interface CodeCoverage {
  code: string;
  rows: number;
  minDate: string | null;
  maxDate: string | null;
  sources: BarSource[];
}

export interface DateRange {
  from?: string;
  to?: string;
}

// ---- 板・約定・分足（collector が記録） ----

export type TradeSide = "buy" | "sell" | "unknown";

/** 板スナップショット。気配は上位N本を [価格, 数量] の配列で持つ（asks: 売り気配＝安い順、bids: 買い気配＝高い順） */
export interface BoardSnapshot {
  tradeDate: string;
  code: string;
  /** 受信時刻（ISO8601, JST オフセット付き） */
  ts: string;
  currentPrice: number | null;
  currentPriceTime: string | null;
  /** 累計出来高 */
  volume: number | null;
  vwap: number | null;
  bestAsk: number | null;
  bestAskQty: number | null;
  bestAskSign: string | null;
  bestBid: number | null;
  bestBidQty: number | null;
  bestBidSign: string | null;
  marketSellQty: number | null;
  marketBuyQty: number | null;
  overSellQty: number | null;
  underBuyQty: number | null;
  asks: [number, number][];
  bids: [number, number][];
}

export interface Trade {
  tradeDate: string;
  code: string;
  seq: number;
  ts: string;
  price: number;
  qty: number;
  side: TradeSide;
  /** push: PUSH の出来高差分から復元、rest: 歩み値 API */
  origin: "push" | "rest";
}

export interface MinuteBar {
  code: string;
  tradeDate: string;
  intervalMin: 1 | 5;
  /** バー開始時刻（ISO8601） */
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  source: "kabu" | "yahoo";
}

export interface CollectorSession {
  id: number;
  tradeDate: string;
  startedAt: string;
  endedAt: string | null;
  symbolCount: number;
  lastMessageAt: string | null;
  note: string | null;
}

export interface CollectorGap {
  id: number;
  tradeDate: string;
  startedAt: string;
  endedAt: string | null;
  reason: string;
}

export interface CollectorDailyStats {
  tradeDate: string;
  snapshots: number;
  trades: number;
  symbols: number;
  dbBytes: number | null;
  updatedAt: string;
}

/** 銘柄・日ごとの最新の時価情報（collector が更新） */
export interface BoardDayInfo {
  tradeDate: string;
  code: string;
  previousClose: number | null;
  openingPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  currentPrice: number | null;
  calcPrice: number | null;
  volume: number | null;
  bestAsk: number | null;
  bestAskQty: number | null;
  bestAskSign: string | null;
  bestBid: number | null;
  bestBidQty: number | null;
  bestBidSign: string | null;
  marketBuyQty: number | null;
  marketSellQty: number | null;
  updatedAt: string;
}
