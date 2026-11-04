import { describe, expect, it } from "vitest";
import { normalizeKabuBoard } from "./normalize";
import type { KabuBoard } from "./types";

const raw: KabuBoard = {
  Symbol: "7203",
  Exchange: 1,
  CurrentPrice: 3000,
  CurrentPriceTime: "2026-11-04T09:00:05+09:00",
  CurrentPriceChangeStatus: "0057",
  CalcPrice: 3000,
  PreviousClose: 2950,
  OpeningPrice: 2990,
  HighPrice: 3010,
  LowPrice: 2985,
  TradingVolume: 123400,
  TradingValue: 370000000,
  VWAP: 2998.5,
  // 名称が逆: Bid* = 最良「売」気配
  BidQty: 500,
  BidPrice: 3001,
  BidTime: "2026-11-04T09:00:05+09:00",
  BidSign: "0101",
  // Ask* = 最良「買」気配
  AskQty: 700,
  AskPrice: 3000,
  AskTime: "2026-11-04T09:00:04+09:00",
  AskSign: "0101",
  MarketOrderSellQty: 0,
  MarketOrderBuyQty: 100,
  Sell1: { Time: "2026-11-04T09:00:05+09:00", Sign: "0101", Price: 3001, Qty: 500 },
  Sell2: { Price: 3002, Qty: 300 },
  Sell3: { Price: 3003, Qty: 200 },
  Buy1: { Time: "2026-11-04T09:00:04+09:00", Sign: "0101", Price: 3000, Qty: 700 },
  Buy2: { Price: 2999, Qty: 100 },
  OverSellQty: 50000,
  UnderBuyQty: 60000,
  TotalMarketValue: 45000000000000,
};

describe("normalizeKabuBoard（Bid/Ask の読み替えはここで固定する）", () => {
  it("BidPrice は最良売り（ask）、AskPrice は最良買い（bid）に割り当てる", () => {
    const b = normalizeKabuBoard(raw, "2026-11-04T09:00:05.100+09:00");
    expect(b.bestAsk).toEqual({ price: 3001, qty: 500, sign: "0101", time: "2026-11-04T09:00:05+09:00" });
    expect(b.bestBid).toEqual({ price: 3000, qty: 700, sign: "0101", time: "2026-11-04T09:00:04+09:00" });
    // 整合性: 売り気配1本目 = bestAsk、買い気配1本目 = bestBid
    expect(b.asks[0].price).toBe(b.bestAsk.price);
    expect(b.bids[0].price).toBe(b.bestBid.price);
    expect(b.bestAsk.price!).toBeGreaterThan(b.bestBid.price!);
  });

  it("板は depth 本に切り詰め、欠けた段は null", () => {
    const b = normalizeKabuBoard(raw, "x", 5);
    expect(b.asks).toHaveLength(5);
    expect(b.asks.map((a) => a.price)).toEqual([3001, 3002, 3003, null, null]);
    expect(b.bids.map((a) => a.qty)).toEqual([700, 100, null, null, null]);
  });

  it("成行・OVER/UNDER・その他の項目", () => {
    const b = normalizeKabuBoard(raw, "x");
    expect(b).toMatchObject({
      code: "7203",
      currentPrice: 3000,
      previousClose: 2950,
      openingPrice: 2990,
      tradingVolume: 123400,
      marketSellQty: 0,
      marketBuyQty: 100,
      overSellQty: 50000,
      underBuyQty: 60000,
      vwap: 2998.5,
    });
  });

  it("寄り前の板（現在値 null、寄前気配）", () => {
    const b = normalizeKabuBoard({ Symbol: "7203", CurrentPrice: null, BidPrice: 3005, BidQty: 1000, BidSign: "0107", AskPrice: 3005, AskQty: 1200, AskSign: "0107", TradingVolume: null }, "x");
    expect(b.currentPrice).toBeNull();
    expect(b.bestAsk.sign).toBe("0107");
    expect(b.tradingVolume).toBeNull();
  });
});
