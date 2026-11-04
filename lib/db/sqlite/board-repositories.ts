import type { BoardDayInfoRepository, BoardSnapshotRepository, CollectorStatusRepository, MinuteBarRepository, TradeRepository } from "../repositories";
import type { BoardDayInfo, BoardSnapshot, CollectorDailyStats, CollectorGap, CollectorSession, MinuteBar, Trade } from "../types";
import { nowIso } from "@/lib/dates";
import type { SqliteDb } from "./connection";

interface SnapshotRow {
  trade_date: string;
  code: string;
  ts: string;
  current_price: number | null;
  current_price_time: string | null;
  volume: number | null;
  vwap: number | null;
  best_ask: number | null;
  best_ask_qty: number | null;
  best_ask_sign: string | null;
  best_bid: number | null;
  best_bid_qty: number | null;
  best_bid_sign: string | null;
  market_sell_qty: number | null;
  market_buy_qty: number | null;
  over_sell_qty: number | null;
  under_buy_qty: number | null;
  asks: string;
  bids: string;
}

function rowToSnapshot(r: SnapshotRow): BoardSnapshot {
  return {
    tradeDate: r.trade_date,
    code: r.code,
    ts: r.ts,
    currentPrice: r.current_price,
    currentPriceTime: r.current_price_time,
    volume: r.volume,
    vwap: r.vwap,
    bestAsk: r.best_ask,
    bestAskQty: r.best_ask_qty,
    bestAskSign: r.best_ask_sign,
    bestBid: r.best_bid,
    bestBidQty: r.best_bid_qty,
    bestBidSign: r.best_bid_sign,
    marketSellQty: r.market_sell_qty,
    marketBuyQty: r.market_buy_qty,
    overSellQty: r.over_sell_qty,
    underBuyQty: r.under_buy_qty,
    asks: JSON.parse(r.asks) as [number, number][],
    bids: JSON.parse(r.bids) as [number, number][],
  };
}

export class SqliteBoardSnapshotRepository implements BoardSnapshotRepository {
  private readonly insert;
  constructor(private readonly db: SqliteDb) {
    this.insert = db.prepare(`
      INSERT OR REPLACE INTO board_snapshots (trade_date, code, ts, current_price, current_price_time, volume, vwap,
        best_ask, best_ask_qty, best_ask_sign, best_bid, best_bid_qty, best_bid_sign,
        market_sell_qty, market_buy_qty, over_sell_qty, under_buy_qty, asks, bids)
      VALUES (@trade_date, @code, @ts, @current_price, @current_price_time, @volume, @vwap,
        @best_ask, @best_ask_qty, @best_ask_sign, @best_bid, @best_bid_qty, @best_bid_sign,
        @market_sell_qty, @market_buy_qty, @over_sell_qty, @under_buy_qty, @asks, @bids)`);
  }
  insertMany(rows: BoardSnapshot[]): number {
    const tx = this.db.transaction((items: BoardSnapshot[]) => {
      for (const s of items) {
        this.insert.run({
          trade_date: s.tradeDate,
          code: s.code,
          ts: s.ts,
          current_price: s.currentPrice,
          current_price_time: s.currentPriceTime,
          volume: s.volume,
          vwap: s.vwap,
          best_ask: s.bestAsk,
          best_ask_qty: s.bestAskQty,
          best_ask_sign: s.bestAskSign,
          best_bid: s.bestBid,
          best_bid_qty: s.bestBidQty,
          best_bid_sign: s.bestBidSign,
          market_sell_qty: s.marketSellQty,
          market_buy_qty: s.marketBuyQty,
          over_sell_qty: s.overSellQty,
          under_buy_qty: s.underBuyQty,
          asks: JSON.stringify(s.asks),
          bids: JSON.stringify(s.bids),
        });
      }
      return items.length;
    });
    return tx(rows);
  }
  find(code: string, tradeDate: string, range?: { from?: string; to?: string }): BoardSnapshot[] {
    const params: Record<string, unknown> = { code, tradeDate };
    let where = "code = @code AND trade_date = @tradeDate";
    if (range?.from) {
      where += " AND ts >= @from";
      params.from = range.from;
    }
    if (range?.to) {
      where += " AND ts <= @to";
      params.to = range.to;
    }
    return (this.db.prepare(`SELECT * FROM board_snapshots WHERE ${where} ORDER BY ts`).all(params) as SnapshotRow[]).map(rowToSnapshot);
  }
  listDates(code?: string): string[] {
    const sql = code
      ? "SELECT DISTINCT trade_date AS d FROM board_snapshots WHERE code = ? ORDER BY d DESC"
      : "SELECT DISTINCT trade_date AS d FROM board_snapshots ORDER BY d DESC";
    return (code ? this.db.prepare(sql).all(code) : this.db.prepare(sql).all()).map((r) => (r as { d: string }).d);
  }
  listCodes(tradeDate: string): string[] {
    return (this.db.prepare("SELECT DISTINCT code FROM board_snapshots WHERE trade_date = ? ORDER BY code").all(tradeDate) as { code: string }[]).map((r) => r.code);
  }
  countByDate(tradeDate: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM board_snapshots WHERE trade_date = ?").get(tradeDate) as { n: number }).n;
  }
  deleteByDate(tradeDate: string): number {
    return this.db.prepare("DELETE FROM board_snapshots WHERE trade_date = ?").run(tradeDate).changes;
  }
}

interface TradeRow {
  trade_date: string;
  code: string;
  seq: number;
  ts: string;
  price: number;
  qty: number;
  side: Trade["side"];
  origin: Trade["origin"];
}

export class SqliteTradeRepository implements TradeRepository {
  private readonly insert;
  constructor(private readonly db: SqliteDb) {
    this.insert = db.prepare(
      `INSERT OR REPLACE INTO trades (trade_date, code, seq, ts, price, qty, side, origin)
       VALUES (@trade_date, @code, @seq, @ts, @price, @qty, @side, @origin)`,
    );
  }
  insertMany(rows: Trade[]): number {
    const tx = this.db.transaction((items: Trade[]) => {
      for (const t of items) {
        this.insert.run({ trade_date: t.tradeDate, code: t.code, seq: t.seq, ts: t.ts, price: t.price, qty: t.qty, side: t.side, origin: t.origin });
      }
      return items.length;
    });
    return tx(rows);
  }
  find(code: string, tradeDate: string): Trade[] {
    return (this.db.prepare("SELECT * FROM trades WHERE code = ? AND trade_date = ? ORDER BY seq").all(code, tradeDate) as TradeRow[]).map((r) => ({
      tradeDate: r.trade_date,
      code: r.code,
      seq: r.seq,
      ts: r.ts,
      price: r.price,
      qty: r.qty,
      side: r.side,
      origin: r.origin,
    }));
  }
  nextSeq(code: string, tradeDate: string): number {
    const r = this.db.prepare("SELECT MAX(seq) AS m FROM trades WHERE code = ? AND trade_date = ?").get(code, tradeDate) as { m: number | null };
    return (r.m ?? 0) + 1;
  }
  countByDate(tradeDate: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM trades WHERE trade_date = ?").get(tradeDate) as { n: number }).n;
  }
  deleteByDate(tradeDate: string): number {
    return this.db.prepare("DELETE FROM trades WHERE trade_date = ?").run(tradeDate).changes;
  }
}

interface MinuteRow {
  code: string;
  trade_date: string;
  interval_min: number;
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  source: MinuteBar["source"];
}

export class SqliteMinuteBarRepository implements MinuteBarRepository {
  private readonly insert;
  constructor(private readonly db: SqliteDb) {
    this.insert = db.prepare(`
      INSERT INTO minute_bars (code, trade_date, interval_min, ts, open, high, low, close, volume, source)
      VALUES (@code, @trade_date, @interval_min, @ts, @open, @high, @low, @close, @volume, @source)
      ON CONFLICT (code, trade_date, interval_min, ts, source) DO UPDATE SET
        open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close, volume = excluded.volume`);
  }
  upsertMany(rows: MinuteBar[]): number {
    const tx = this.db.transaction((items: MinuteBar[]) => {
      for (const b of items) {
        this.insert.run({
          code: b.code,
          trade_date: b.tradeDate,
          interval_min: b.intervalMin,
          ts: b.ts,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
          source: b.source,
        });
      }
      return items.length;
    });
    return tx(rows);
  }
  find(code: string, tradeDate: string, intervalMin: 1 | 5, source?: MinuteBar["source"]): MinuteBar[] {
    const params: Record<string, unknown> = { code, tradeDate, intervalMin };
    let where = "code = @code AND trade_date = @tradeDate AND interval_min = @intervalMin";
    if (source) {
      where += " AND source = @source";
      params.source = source;
    }
    return (this.db.prepare(`SELECT * FROM minute_bars WHERE ${where} ORDER BY ts`).all(params) as MinuteRow[]).map((r) => ({
      code: r.code,
      tradeDate: r.trade_date,
      intervalMin: r.interval_min as 1 | 5,
      ts: r.ts,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      source: r.source,
    }));
  }
  listDates(code: string): string[] {
    return (this.db.prepare("SELECT DISTINCT trade_date AS d FROM minute_bars WHERE code = ? ORDER BY d DESC").all(code) as { d: string }[]).map((r) => r.d);
  }
}

interface SessionRow {
  id: number;
  trade_date: string;
  started_at: string;
  ended_at: string | null;
  symbol_count: number;
  last_message_at: string | null;
  note: string | null;
}
interface GapRow {
  id: number;
  trade_date: string;
  started_at: string;
  ended_at: string | null;
  reason: string;
}
interface StatsRow {
  trade_date: string;
  snapshots: number;
  trades: number;
  symbols: number;
  db_bytes: number | null;
  updated_at: string;
}

const toSession = (r: SessionRow): CollectorSession => ({
  id: r.id,
  tradeDate: r.trade_date,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  symbolCount: r.symbol_count,
  lastMessageAt: r.last_message_at,
  note: r.note,
});
const toGap = (r: GapRow): CollectorGap => ({ id: r.id, tradeDate: r.trade_date, startedAt: r.started_at, endedAt: r.ended_at, reason: r.reason });

export class SqliteCollectorStatusRepository implements CollectorStatusRepository {
  constructor(private readonly db: SqliteDb) {}
  startSession(tradeDate: string, symbolCount: number, note?: string): number {
    const r = this.db
      .prepare("INSERT INTO collector_sessions (trade_date, started_at, symbol_count, note) VALUES (?, ?, ?, ?)")
      .run(tradeDate, nowIso(), symbolCount, note ?? null);
    return Number(r.lastInsertRowid);
  }
  touchSession(id: number, lastMessageAt: string, symbolCount?: number): void {
    if (symbolCount === undefined) this.db.prepare("UPDATE collector_sessions SET last_message_at = ? WHERE id = ?").run(lastMessageAt, id);
    else this.db.prepare("UPDATE collector_sessions SET last_message_at = ?, symbol_count = ? WHERE id = ?").run(lastMessageAt, symbolCount, id);
  }
  endSession(id: number, endedAt: string, note?: string): void {
    if (note === undefined) this.db.prepare("UPDATE collector_sessions SET ended_at = ? WHERE id = ?").run(endedAt, id);
    else this.db.prepare("UPDATE collector_sessions SET ended_at = ?, note = ? WHERE id = ?").run(endedAt, note, id);
  }
  latestSession(): CollectorSession | null {
    const r = this.db.prepare("SELECT * FROM collector_sessions ORDER BY id DESC LIMIT 1").get() as SessionRow | undefined;
    return r ? toSession(r) : null;
  }
  listSessions(limit = 30): CollectorSession[] {
    return (this.db.prepare("SELECT * FROM collector_sessions ORDER BY id DESC LIMIT ?").all(limit) as SessionRow[]).map(toSession);
  }
  openGap(tradeDate: string, startedAt: string, reason: string): number {
    const r = this.db.prepare("INSERT INTO collector_gaps (trade_date, started_at, reason) VALUES (?, ?, ?)").run(tradeDate, startedAt, reason);
    return Number(r.lastInsertRowid);
  }
  closeGap(id: number, endedAt: string): void {
    this.db.prepare("UPDATE collector_gaps SET ended_at = ? WHERE id = ?").run(endedAt, id);
  }
  listGaps(tradeDate?: string, limit = 100): CollectorGap[] {
    const rows = tradeDate
      ? (this.db.prepare("SELECT * FROM collector_gaps WHERE trade_date = ? ORDER BY id DESC LIMIT ?").all(tradeDate, limit) as GapRow[])
      : (this.db.prepare("SELECT * FROM collector_gaps ORDER BY id DESC LIMIT ?").all(limit) as GapRow[]);
    return rows.map(toGap);
  }
  upsertDailyStats(s: Omit<CollectorDailyStats, "updatedAt">): void {
    this.db
      .prepare(
        `INSERT INTO collector_daily_stats (trade_date, snapshots, trades, symbols, db_bytes, updated_at)
         VALUES (@trade_date, @snapshots, @trades, @symbols, @db_bytes, @updated_at)
         ON CONFLICT (trade_date) DO UPDATE SET snapshots = excluded.snapshots, trades = excluded.trades,
           symbols = excluded.symbols, db_bytes = excluded.db_bytes, updated_at = excluded.updated_at`,
      )
      .run({ trade_date: s.tradeDate, snapshots: s.snapshots, trades: s.trades, symbols: s.symbols, db_bytes: s.dbBytes, updated_at: nowIso() });
  }
  listDailyStats(limit = 60): CollectorDailyStats[] {
    return (this.db.prepare("SELECT * FROM collector_daily_stats ORDER BY trade_date DESC LIMIT ?").all(limit) as StatsRow[]).map((r) => ({
      tradeDate: r.trade_date,
      snapshots: r.snapshots,
      trades: r.trades,
      symbols: r.symbols,
      dbBytes: r.db_bytes,
      updatedAt: r.updated_at,
    }));
  }
}

interface DayInfoRow {
  trade_date: string;
  code: string;
  previous_close: number | null;
  opening_price: number | null;
  high_price: number | null;
  low_price: number | null;
  current_price: number | null;
  calc_price: number | null;
  volume: number | null;
  best_ask: number | null;
  best_ask_qty: number | null;
  best_ask_sign: string | null;
  best_bid: number | null;
  best_bid_qty: number | null;
  best_bid_sign: string | null;
  market_buy_qty: number | null;
  market_sell_qty: number | null;
  updated_at: string;
}

const toDayInfo = (r: DayInfoRow): BoardDayInfo => ({
  tradeDate: r.trade_date,
  code: r.code,
  previousClose: r.previous_close,
  openingPrice: r.opening_price,
  highPrice: r.high_price,
  lowPrice: r.low_price,
  currentPrice: r.current_price,
  calcPrice: r.calc_price,
  volume: r.volume,
  bestAsk: r.best_ask,
  bestAskQty: r.best_ask_qty,
  bestAskSign: r.best_ask_sign,
  bestBid: r.best_bid,
  bestBidQty: r.best_bid_qty,
  bestBidSign: r.best_bid_sign,
  marketBuyQty: r.market_buy_qty,
  marketSellQty: r.market_sell_qty,
  updatedAt: r.updated_at,
});

export class SqliteBoardDayInfoRepository implements BoardDayInfoRepository {
  private readonly insert;
  constructor(private readonly db: SqliteDb) {
    this.insert = db.prepare(`
      INSERT INTO board_day_info (trade_date, code, previous_close, opening_price, high_price, low_price, current_price, calc_price, volume,
        best_ask, best_ask_qty, best_ask_sign, best_bid, best_bid_qty, best_bid_sign, market_buy_qty, market_sell_qty, updated_at)
      VALUES (@trade_date, @code, @previous_close, @opening_price, @high_price, @low_price, @current_price, @calc_price, @volume,
        @best_ask, @best_ask_qty, @best_ask_sign, @best_bid, @best_bid_qty, @best_bid_sign, @market_buy_qty, @market_sell_qty, @updated_at)
      ON CONFLICT (trade_date, code) DO UPDATE SET
        previous_close = excluded.previous_close, opening_price = excluded.opening_price, high_price = excluded.high_price,
        low_price = excluded.low_price, current_price = excluded.current_price, calc_price = excluded.calc_price, volume = excluded.volume,
        best_ask = excluded.best_ask, best_ask_qty = excluded.best_ask_qty, best_ask_sign = excluded.best_ask_sign,
        best_bid = excluded.best_bid, best_bid_qty = excluded.best_bid_qty, best_bid_sign = excluded.best_bid_sign,
        market_buy_qty = excluded.market_buy_qty, market_sell_qty = excluded.market_sell_qty, updated_at = excluded.updated_at`);
  }
  upsertMany(rows: BoardDayInfo[]): number {
    const tx = this.db.transaction((items: BoardDayInfo[]) => {
      for (const i of items) {
        this.insert.run({
          trade_date: i.tradeDate,
          code: i.code,
          previous_close: i.previousClose,
          opening_price: i.openingPrice,
          high_price: i.highPrice,
          low_price: i.lowPrice,
          current_price: i.currentPrice,
          calc_price: i.calcPrice,
          volume: i.volume,
          best_ask: i.bestAsk,
          best_ask_qty: i.bestAskQty,
          best_ask_sign: i.bestAskSign,
          best_bid: i.bestBid,
          best_bid_qty: i.bestBidQty,
          best_bid_sign: i.bestBidSign,
          market_buy_qty: i.marketBuyQty,
          market_sell_qty: i.marketSellQty,
          updated_at: i.updatedAt,
        });
      }
      return items.length;
    });
    return tx(rows);
  }
  findByDate(tradeDate: string): BoardDayInfo[] {
    return (this.db.prepare("SELECT * FROM board_day_info WHERE trade_date = ? ORDER BY code").all(tradeDate) as DayInfoRow[]).map(toDayInfo);
  }
  get(tradeDate: string, code: string): BoardDayInfo | null {
    const r = this.db.prepare("SELECT * FROM board_day_info WHERE trade_date = ? AND code = ?").get(tradeDate, code) as DayInfoRow | undefined;
    return r ? toDayInfo(r) : null;
  }
  latestDate(): string | null {
    const r = this.db.prepare("SELECT MAX(trade_date) AS d FROM board_day_info").get() as { d: string | null };
    return r.d;
  }
}
