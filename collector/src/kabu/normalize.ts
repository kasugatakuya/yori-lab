import { normalizeCode } from "@/lib/codes";
import type { BestQuote, NormalizedBoard, QuoteLevel } from "../provider";
import type { KabuBoard, KabuDepthLevel } from "./types";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function level(l: KabuDepthLevel | null | undefined): QuoteLevel {
  return { price: num(l?.Price), qty: num(l?.Qty) };
}

/**
 * kabuステーションの板を正規化する。**Bid/Ask の読み替えはここだけで行う。**
 *
 * 公式仕様の注記: 「レスポンスにある「Bid」と「Ask」は、本来の意味である「買気配」と「売気配」と逆になっております。
 * 実際に返却される値は日本語の説明に準じたもの」。日本語の説明は
 *   BidPrice = 最良売気配値段 / AskPrice = 最良買気配値段
 * なので、bestAsk（売り）には Bid*、bestBid（買い）には Ask* を割り当てる。
 * Sell1..10 は売気配、Buy1..10 は買気配で、こちらは名称どおり。
 */
export function normalizeKabuBoard(raw: KabuBoard, receivedAt: string, depth = 10): NormalizedBoard {
  const asks: QuoteLevel[] = [];
  const bids: QuoteLevel[] = [];
  for (let i = 1; i <= Math.min(10, Math.max(1, depth)); i++) {
    asks.push(level(raw[`Sell${i}`] as KabuDepthLevel | null | undefined));
    bids.push(level(raw[`Buy${i}`] as KabuDepthLevel | null | undefined));
  }
  const bestAsk: BestQuote = { price: num(raw.BidPrice), qty: num(raw.BidQty), sign: str(raw.BidSign), time: str(raw.BidTime) };
  const bestBid: BestQuote = { price: num(raw.AskPrice), qty: num(raw.AskQty), sign: str(raw.AskSign), time: str(raw.AskTime) };
  return {
    code: normalizeCode(raw.Symbol),
    exchange: num(raw.Exchange) ?? 1,
    receivedAt,
    currentPrice: num(raw.CurrentPrice),
    currentPriceTime: str(raw.CurrentPriceTime),
    currentPriceChangeStatus: str(raw.CurrentPriceChangeStatus),
    calcPrice: num(raw.CalcPrice),
    previousClose: num(raw.PreviousClose),
    openingPrice: num(raw.OpeningPrice),
    highPrice: num(raw.HighPrice),
    lowPrice: num(raw.LowPrice),
    tradingVolume: num(raw.TradingVolume),
    tradingValue: num(raw.TradingValue),
    vwap: num(raw.VWAP),
    bestAsk,
    bestBid,
    asks,
    bids,
    marketSellQty: num(raw.MarketOrderSellQty),
    marketBuyQty: num(raw.MarketOrderBuyQty),
    overSellQty: num(raw.OverSellQty),
    underBuyQty: num(raw.UnderBuyQty),
    totalMarketValue: num(raw.TotalMarketValue),
  };
}
