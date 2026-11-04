import type { BoardSnapshot, Trade } from "@/lib/db/types";

export type { BoardSnapshot, Trade };

/** 板の厚みの要約（1スナップショット） */
export interface DepthSummary {
  ts: string;
  bestAsk: number | null;
  bestBid: number | null;
  /** スプレッド（絶対値）と対中値比 */
  spread: number | null;
  spreadPct: number | null;
  mid: number | null;
  askQty: number;
  bidQty: number;
  /** 買い数量 / 売り数量（上位N本）。売りが 0 なら null */
  bidAskRatio: number | null;
  /** 板の偏り = (買い − 売り) / (買い + 売り)。-1〜1 */
  imbalance: number;
  marketBuyQty: number | null;
  marketSellQty: number | null;
}

/** 大口注文の出現・消失 */
export interface LargeOrderEvent {
  ts: string;
  side: "ask" | "bid";
  price: number;
  qty: number;
  kind: "appeared" | "disappeared";
  /** 中央値の何倍か */
  ratio: number;
}

/** 気配の薄い価格帯 */
export interface ThinLevel {
  side: "ask" | "bid";
  price: number;
  qty: number;
  ratio: number;
}

export interface FlowBucket {
  /** バケット開始時刻 */
  ts: string;
  buyQty: number;
  sellQty: number;
  unknownQty: number;
  trades: number;
  /** 買い圧力 = (買い − 売り) / (買い + 売り) */
  pressure: number | null;
  /** オーダーフローインバランス（Cont et al. 2014）の合計 */
  ofi: number;
  /** バケット内の最終現在値 */
  lastPrice: number | null;
}

export interface PreOpenPoint {
  ts: string;
  /** 寄前気配の中値（または calc） */
  indicative: number | null;
  askQty: number;
  bidQty: number;
  imbalance: number;
  marketBuyQty: number | null;
  marketSellQty: number | null;
}

export interface PreOpenSummary {
  points: PreOpenPoint[];
  /** 寄り直前（最後の寄前スナップショット）の気配 */
  lastIndicative: number | null;
  lastImbalance: number | null;
  /** 寄り直前の成行数量バランス = (買成行 − 売成行) / (買成行 + 売成行) */
  lastMarketBalance: number | null;
  openPrice: number | null;
  /** 寄り直前の気配と始値の乖離率 */
  deviationFromOpen: number | null;
}

export interface PostOpenSummary {
  openPrice: number | null;
  openTs: string | null;
  /** 寄り後 1分 / 5分 / 15分 / 30分 の騰落率（データが無ければ null） */
  move1m: number | null;
  move5m: number | null;
  move15m: number | null;
  move30m: number | null;
  /** 寄り直後 1分 / 5分 の OFI と買い圧力 */
  ofi1m: number | null;
  ofi5m: number | null;
  pressure5m: number | null;
}

/** 1銘柄・1日の板分析の要約（条件別集計の入力） */
export interface BoardDaySummary {
  code: string;
  tradeDate: string;
  preOpen: PreOpenSummary;
  postOpen: PostOpenSummary;
  /** 引けの騰落率（寄りからの）。自前日足などから。無ければ null */
  moveToClose: number | null;
}
