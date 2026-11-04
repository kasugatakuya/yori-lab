import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ParquetReader } from "@dsnp/parquetjs";
import { describe, expect, it } from "vitest";
import { openSqliteRepositories } from "@/lib/db";
import { archiveDate, purgeDate } from "./archive";

describe("archive", () => {
  it("Parquet に書き出し、削除できる", async () => {
    const repos = openSqliteRepositories(":memory:");
    repos.boardSnapshots.insertMany([
      { tradeDate: "2026-11-04", code: "7203", ts: "2026-11-04T08:00:00+09:00", currentPrice: null, currentPriceTime: null, volume: null, vwap: null, bestAsk: 100, bestAskQty: 1, bestAskSign: "0107", bestBid: 100, bestBidQty: 2, bestBidSign: "0107", marketSellQty: 0, marketBuyQty: 0, overSellQty: null, underBuyQty: null, asks: [[100, 1]], bids: [[100, 2]] },
    ]);
    repos.trades.insertMany([{ tradeDate: "2026-11-04", code: "7203", seq: 1, ts: "2026-11-04T09:00:00+09:00", price: 100, qty: 10, side: "buy", origin: "push" }]);
    repos.minuteBars.upsertMany([{ code: "7203", tradeDate: "2026-11-04", intervalMin: 1, ts: "2026-11-04T09:00:00+09:00", open: 1, high: 1, low: 1, close: 1, volume: 1, source: "kabu" }]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "yori-archive-"));
    const r = await archiveDate(repos, "2026-11-04", root);
    expect(r).toMatchObject({ snapshots: 1, trades: 1, minuteBars: 1 });
    expect(r.bytes).toBeGreaterThan(0);
    const reader = await ParquetReader.openFile(path.join(r.dir, "trades.parquet"));
    const cursor = reader.getCursor();
    const row = (await cursor.next()) as { code: string; price: number; seq: bigint | number };
    expect(row.code).toBe("7203");
    expect(row.price).toBe(100);
    await reader.close();
    expect(purgeDate(repos, "2026-11-04")).toEqual({ snapshots: 1, trades: 1 });
    expect(repos.boardSnapshots.countByDate("2026-11-04")).toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
    repos.close();
  });
});
