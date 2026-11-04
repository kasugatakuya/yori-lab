/**
 * kabuステーションAPI の生レスポンス型（REST /board と PUSH は同じ形）。
 * 公式: docs/specs/kabu-station-api.yaml（BoardSuccess）
 *
 * 注意（公式注記 ※①）: Bid* / Ask* の名称は本来の意味と逆で、
 *   BidQty/BidPrice/BidTime/BidSign = 最良「売」気配、AskQty/AskPrice/AskTime/AskSign = 最良「買」気配。
 * 読み替えは normalize.ts に集約する。
 */
export interface KabuDepthLevel {
  Price?: number | null;
  Qty?: number | null;
  Time?: string | null;
  Sign?: string | null;
}

export interface KabuBoard {
  Symbol: string;
  SymbolName?: string;
  Exchange?: number;
  ExchangeName?: string;
  CurrentPrice?: number | null;
  CurrentPriceTime?: string | null;
  CurrentPriceChangeStatus?: string | null;
  CurrentPriceStatus?: number | null;
  CalcPrice?: number | null;
  PreviousClose?: number | null;
  PreviousCloseTime?: string | null;
  ChangePreviousClose?: number | null;
  ChangePreviousClosePer?: number | null;
  OpeningPrice?: number | null;
  OpeningPriceTime?: string | null;
  HighPrice?: number | null;
  HighPriceTime?: string | null;
  LowPrice?: number | null;
  LowPriceTime?: string | null;
  TradingVolume?: number | null;
  TradingVolumeTime?: string | null;
  VWAP?: number | null;
  TradingValue?: number | null;
  /** 最良「売」気配（名称が逆） */
  BidQty?: number | null;
  BidPrice?: number | null;
  BidTime?: string | null;
  BidSign?: string | null;
  MarketOrderSellQty?: number | null;
  Sell1?: KabuDepthLevel | null;
  Sell2?: KabuDepthLevel | null;
  Sell3?: KabuDepthLevel | null;
  Sell4?: KabuDepthLevel | null;
  Sell5?: KabuDepthLevel | null;
  Sell6?: KabuDepthLevel | null;
  Sell7?: KabuDepthLevel | null;
  Sell8?: KabuDepthLevel | null;
  Sell9?: KabuDepthLevel | null;
  Sell10?: KabuDepthLevel | null;
  /** 最良「買」気配（名称が逆） */
  AskQty?: number | null;
  AskPrice?: number | null;
  AskTime?: string | null;
  AskSign?: string | null;
  MarketOrderBuyQty?: number | null;
  Buy1?: KabuDepthLevel | null;
  Buy2?: KabuDepthLevel | null;
  Buy3?: KabuDepthLevel | null;
  Buy4?: KabuDepthLevel | null;
  Buy5?: KabuDepthLevel | null;
  Buy6?: KabuDepthLevel | null;
  Buy7?: KabuDepthLevel | null;
  Buy8?: KabuDepthLevel | null;
  Buy9?: KabuDepthLevel | null;
  Buy10?: KabuDepthLevel | null;
  OverSellQty?: number | null;
  UnderBuyQty?: number | null;
  TotalMarketValue?: number | null;
  SecurityType?: number | null;
  [key: string]: unknown;
}

export interface KabuTokenResponse {
  ResultCode: number;
  Token: string;
}

export interface KabuRegisterResponse {
  RegistList: { Symbol: string; Exchange: number }[];
}

export interface KabuTimeAndSalesResponse {
  Symbol: string;
  Exchange: number;
  TradingPriceCount: number;
  TradingPrice: { Time: string; Volume: number; Price: number }[];
}

export interface KabuErrorResponse {
  Code: number;
  Message: string;
}

/** 気配種別コード（Sign） */
export const KABU_SIGN: Record<string, string> = {
  "0000": "事象なし",
  "0101": "一般気配",
  "0102": "特別気配",
  "0103": "注意気配",
  "0107": "寄前気配",
  "0108": "停止前特別気配",
  "0109": "引け後気配",
  "0116": "寄前気配約定成立ポイントなし",
  "0117": "寄前気配約定成立ポイントあり",
  "0118": "連続約定気配",
  "0119": "停止前の連続約定気配",
  "0120": "買い上がり売り下がり中",
};

/** 寄り前（板寄せ前）を示す気配種別 */
export const PRE_OPEN_SIGNS = new Set(["0107", "0116", "0117"]);
