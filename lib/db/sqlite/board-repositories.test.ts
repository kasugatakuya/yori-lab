import { describe, expect, it } from "vitest";
import { openSqliteRepositories } from "./index";
import type { BoardSnapshot, Trade } from "../types";

const snap = (ts: string, extra: Partial<BoardSnapshot> = {}): BoardSnapshot => ({
  tradeDate: "2026-11-04",
  code: "7203",
  ts,
  currentPrice: 3000,
  currentPriceTime: ts,
  volume: 1000,
  vwap: 2999,
  bestAsk: 3001,
  bestAskQty: 500,
  bestAskSign: "0101",
  bestBid: 3000,
  bestBidQty: 700,
  bestBidSign: "0101",
  marketSellQty: 0,
  marketBuyQty: 0,
  overSellQty: 10000,
  underBuyQty: 12000,
  asks: [
    [3001, 500],
    [3002, 300],
  ],
  bids: [
    [3000, 700],
    [2999, 100],
  ],
  ...extra,
});

describe("board repositories", () => {
  it("snapshots: insert / find / dates / counts / delete", () => {
    const repos = openSqliteRepositories(":memory:");
    repos.boardSnapshots.insertMany([snap("2026-11-04T08:00:00+09:00"), snap("2026-11-04T08:00:01+09:00"), snap("2026-11-04T09:00:00+09:00", { code: "8306" })]);
    const rows = repos.boardSnapshots.find("7203", "2026-11-04");
    expect(rows).toHaveLength(2);
    expect(rows[0].asks).toEqual([
      [3001, 500],
      [3002, 300],
    ]);
    expect(repos.boardSnapshots.find("7203", "2026-11-04", { from: "2026-11-04T08:00:01+09:00" })).toHaveLength(1);
    expect(repos.boardSnapshots.listDates()).toEqual(["2026-11-04"]);
    expect(repos.boardSnapshots.listCodes("2026-11-04")).toEqual(["7203", "8306"]);
    expect(repos.boardSnapshots.countByDate("2026-11-04")).toBe(3);
    expect(repos.boardSnapshots.deleteByDate("2026-11-04")).toBe(3);
    repos.close();
  });

  it("trades: seq / find / counts", () => {
    const repos = openSqliteRepositories(":memory:");
    const t = (seq: number): Trade => ({ tradeDate: "2026-11-04", code: "7203", seq, ts: `2026-11-04T09:00:0${seq}+09:00`, price: 3000 + seq, qty: 100, side: "buy", origin: "push" });
    expect(repos.trades.nextSeq("7203", "2026-11-04")).toBe(1);
    repos.trades.insertMany([t(1), t(2)]);
    expect(repos.trades.nextSeq("7203", "2026-11-04")).toBe(3);
    expect(repos.trades.find("7203", "2026-11-04").map((x) => x.price)).toEqual([3001, 3002]);
    expect(repos.trades.countByDate("2026-11-04")).toBe(2);
    repos.close();
  });

  it("minute bars upsert / find", () => {
    const repos = openSqliteRepositories(":memory:");
    const b = { code: "7203", tradeDate: "2026-11-04", intervalMin: 1 as const, ts: "2026-11-04T09:00:00+09:00", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, source: "kabu" as const };
    repos.minuteBars.upsertMany([b, { ...b, close: 1.7 }]);
    const rows = repos.minuteBars.find("7203", "2026-11-04", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].close).toBe(1.7);
    expect(repos.minuteBars.find("7203", "2026-11-04", 5)).toHaveLength(0);
    expect(repos.minuteBars.listDates("7203")).toEqual(["2026-11-04"]);
    repos.close();
  });

  it("collector status: sessions / gaps / daily stats", () => {
    const repos = openSqliteRepositories(":memory:");
    const id = repos.collector.startSession("2026-11-04", 10, "mock");
    repos.collector.touchSession(id, "2026-11-04T08:00:05+09:00", 12);
    const gap = repos.collector.openGap("2026-11-04", "2026-11-04T08:10:00+09:00", "disconnected");
    repos.collector.closeGap(gap, "2026-11-04T08:10:30+09:00");
    repos.collector.endSession(id, "2026-11-04T09:30:00+09:00", "done");
    const s = repos.collector.latestSession()!;
    expect(s).toMatchObject({ id, tradeDate: "2026-11-04", symbolCount: 12, lastMessageAt: "2026-11-04T08:00:05+09:00", note: "done" });
    expect(repos.collector.listGaps("2026-11-04")[0]).toMatchObject({ reason: "disconnected", endedAt: "2026-11-04T08:10:30+09:00" });
    repos.collector.upsertDailyStats({ tradeDate: "2026-11-04", snapshots: 100, trades: 50, symbols: 10, dbBytes: 12345 });
    repos.collector.upsertDailyStats({ tradeDate: "2026-11-04", snapshots: 200, trades: 80, symbols: 10, dbBytes: 23456 });
    expect(repos.collector.listDailyStats()[0]).toMatchObject({ snapshots: 200, trades: 80, dbBytes: 23456 });
    repos.close();
  });
});
