import fs from "node:fs";
import path from "node:path";
import { ParquetSchema, ParquetWriter } from "@dsnp/parquetjs";
import type { Repositories } from "@/lib/db";

/**
 * 古い日の板・約定・分足を Parquet に書き出して退避する（容量管理）。
 * 1日 = 1ディレクトリ（data/archive/<date>/）。削除は呼び出し側の判断で行う。
 */

const snapshotSchema = new ParquetSchema({
  trade_date: { type: "UTF8" },
  code: { type: "UTF8" },
  ts: { type: "UTF8" },
  current_price: { type: "DOUBLE", optional: true },
  volume: { type: "DOUBLE", optional: true },
  vwap: { type: "DOUBLE", optional: true },
  best_ask: { type: "DOUBLE", optional: true },
  best_ask_qty: { type: "DOUBLE", optional: true },
  best_ask_sign: { type: "UTF8", optional: true },
  best_bid: { type: "DOUBLE", optional: true },
  best_bid_qty: { type: "DOUBLE", optional: true },
  best_bid_sign: { type: "UTF8", optional: true },
  market_sell_qty: { type: "DOUBLE", optional: true },
  market_buy_qty: { type: "DOUBLE", optional: true },
  over_sell_qty: { type: "DOUBLE", optional: true },
  under_buy_qty: { type: "DOUBLE", optional: true },
  asks: { type: "UTF8" },
  bids: { type: "UTF8" },
});

const tradeSchema = new ParquetSchema({
  trade_date: { type: "UTF8" },
  code: { type: "UTF8" },
  seq: { type: "INT64" },
  ts: { type: "UTF8" },
  price: { type: "DOUBLE" },
  qty: { type: "DOUBLE" },
  side: { type: "UTF8" },
  origin: { type: "UTF8" },
});

const minuteSchema = new ParquetSchema({
  code: { type: "UTF8" },
  trade_date: { type: "UTF8" },
  interval_min: { type: "INT32" },
  ts: { type: "UTF8" },
  open: { type: "DOUBLE", optional: true },
  high: { type: "DOUBLE", optional: true },
  low: { type: "DOUBLE", optional: true },
  close: { type: "DOUBLE", optional: true },
  volume: { type: "DOUBLE", optional: true },
  source: { type: "UTF8" },
});

export interface ArchiveResult {
  tradeDate: string;
  dir: string;
  snapshots: number;
  trades: number;
  minuteBars: number;
  bytes: number;
}

export async function archiveDate(repos: Repositories, tradeDate: string, archiveRoot: string): Promise<ArchiveResult> {
  const dir = path.join(archiveRoot, tradeDate);
  fs.mkdirSync(dir, { recursive: true });
  const codes = repos.boardSnapshots.listCodes(tradeDate);
  let snapshots = 0;
  let trades = 0;
  let minuteBars = 0;

  const sw = await ParquetWriter.openFile(snapshotSchema, path.join(dir, "board_snapshots.parquet"), { useDataPageV2: false });
  const tw = await ParquetWriter.openFile(tradeSchema, path.join(dir, "trades.parquet"), { useDataPageV2: false });
  const mw = await ParquetWriter.openFile(minuteSchema, path.join(dir, "minute_bars.parquet"), { useDataPageV2: false });
  for (const code of codes) {
    for (const s of repos.boardSnapshots.find(code, tradeDate)) {
      await sw.appendRow({
        trade_date: s.tradeDate,
        code: s.code,
        ts: s.ts,
        current_price: s.currentPrice ?? undefined,
        volume: s.volume ?? undefined,
        vwap: s.vwap ?? undefined,
        best_ask: s.bestAsk ?? undefined,
        best_ask_qty: s.bestAskQty ?? undefined,
        best_ask_sign: s.bestAskSign ?? undefined,
        best_bid: s.bestBid ?? undefined,
        best_bid_qty: s.bestBidQty ?? undefined,
        best_bid_sign: s.bestBidSign ?? undefined,
        market_sell_qty: s.marketSellQty ?? undefined,
        market_buy_qty: s.marketBuyQty ?? undefined,
        over_sell_qty: s.overSellQty ?? undefined,
        under_buy_qty: s.underBuyQty ?? undefined,
        asks: JSON.stringify(s.asks),
        bids: JSON.stringify(s.bids),
      });
      snapshots++;
    }
    for (const t of repos.trades.find(code, tradeDate)) {
      await tw.appendRow({ trade_date: t.tradeDate, code: t.code, seq: t.seq, ts: t.ts, price: t.price, qty: t.qty, side: t.side, origin: t.origin });
      trades++;
    }
    for (const interval of [1, 5] as const) {
      for (const b of repos.minuteBars.find(code, tradeDate, interval, "kabu")) {
        await mw.appendRow({
          code: b.code,
          trade_date: b.tradeDate,
          interval_min: b.intervalMin,
          ts: b.ts,
          open: b.open ?? undefined,
          high: b.high ?? undefined,
          low: b.low ?? undefined,
          close: b.close ?? undefined,
          volume: b.volume ?? undefined,
          source: b.source,
        });
        minuteBars++;
      }
    }
  }
  await sw.close();
  await tw.close();
  await mw.close();
  const bytes = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  return { tradeDate, dir, snapshots, trades, minuteBars, bytes };
}

/** 退避済みの日のデータを SQLite から削除する（collector_daily_stats は残す） */
export function purgeDate(repos: Repositories, tradeDate: string): { snapshots: number; trades: number } {
  return repos.transaction(() => ({
    snapshots: repos.boardSnapshots.deleteByDate(tradeDate),
    trades: repos.trades.deleteByDate(tradeDate),
  }));
}
