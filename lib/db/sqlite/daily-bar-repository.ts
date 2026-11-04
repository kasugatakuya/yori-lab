import type { DailyBarRepository } from "../repositories";
import type { BarSource, CodeCoverage, DailyBar, DateRange, SourceCoverage } from "../types";
import type { SqliteDb } from "./connection";

interface Row {
  code: string;
  date: string;
  source: BarSource;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  turnover: number | null;
  adj_factor: number | null;
  adj_open: number | null;
  adj_high: number | null;
  adj_low: number | null;
  adj_close: number | null;
  adj_volume: number | null;
  upper_limit: number | null;
  lower_limit: number | null;
  fetched_at: string;
}

function rowToBar(r: Row): DailyBar {
  return {
    code: r.code,
    date: r.date,
    source: r.source,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    turnover: r.turnover,
    adjFactor: r.adj_factor,
    adjOpen: r.adj_open,
    adjHigh: r.adj_high,
    adjLow: r.adj_low,
    adjClose: r.adj_close,
    adjVolume: r.adj_volume,
    upperLimit: r.upper_limit === null ? null : r.upper_limit === 1,
    lowerLimit: r.lower_limit === null ? null : r.lower_limit === 1,
    fetchedAt: r.fetched_at,
  };
}

function boolToInt(b: boolean | null): number | null {
  return b === null ? null : b ? 1 : 0;
}

/** 出所優先順位: jquants(0) > kabu(1) > yahoo(2) */
const PRIORITY_SQL = `CASE source WHEN 'jquants' THEN 0 WHEN 'kabu' THEN 1 ELSE 2 END`;

const MERGED_FILTER = `source = (
  SELECT b2.source FROM daily_bars b2
  WHERE b2.code = b.code AND b2.date = b.date
  ORDER BY ${PRIORITY_SQL.replaceAll("source", "b2.source")} LIMIT 1
)`;

export class SqliteDailyBarRepository implements DailyBarRepository {
  private readonly insert;

  constructor(private readonly db: SqliteDb) {
    this.insert = db.prepare(`
      INSERT INTO daily_bars (code, date, source, open, high, low, close, volume, turnover,
        adj_factor, adj_open, adj_high, adj_low, adj_close, adj_volume, upper_limit, lower_limit, fetched_at)
      VALUES (@code, @date, @source, @open, @high, @low, @close, @volume, @turnover,
        @adj_factor, @adj_open, @adj_high, @adj_low, @adj_close, @adj_volume, @upper_limit, @lower_limit, @fetched_at)
      ON CONFLICT (code, date, source) DO UPDATE SET
        open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
        volume = excluded.volume, turnover = excluded.turnover,
        adj_factor = excluded.adj_factor, adj_open = excluded.adj_open, adj_high = excluded.adj_high,
        adj_low = excluded.adj_low, adj_close = excluded.adj_close, adj_volume = excluded.adj_volume,
        upper_limit = excluded.upper_limit, lower_limit = excluded.lower_limit, fetched_at = excluded.fetched_at
    `);
  }

  upsertMany(bars: DailyBar[]): number {
    const tx = this.db.transaction((rows: DailyBar[]) => {
      for (const b of rows) {
        this.insert.run({
          code: b.code,
          date: b.date,
          source: b.source,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
          turnover: b.turnover,
          adj_factor: b.adjFactor,
          adj_open: b.adjOpen,
          adj_high: b.adjHigh,
          adj_low: b.adjLow,
          adj_close: b.adjClose,
          adj_volume: b.adjVolume,
          upper_limit: boolToInt(b.upperLimit),
          lower_limit: boolToInt(b.lowerLimit),
          fetched_at: b.fetchedAt,
        });
      }
      return rows.length;
    });
    return tx(bars);
  }

  private rangeClause(range: DateRange | undefined, params: Record<string, unknown>): string {
    let sql = "";
    if (range?.from) {
      sql += " AND b.date >= @from";
      params.from = range.from;
    }
    if (range?.to) {
      sql += " AND b.date <= @to";
      params.to = range.to;
    }
    return sql;
  }

  findMerged(code: string, range?: DateRange): DailyBar[] {
    const params: Record<string, unknown> = { code };
    const sql = `SELECT * FROM daily_bars b WHERE b.code = @code${this.rangeClause(range, params)} AND ${MERGED_FILTER} ORDER BY b.date`;
    return (this.db.prepare(sql).all(params) as Row[]).map(rowToBar);
  }

  findBySource(code: string, source: BarSource, range?: DateRange): DailyBar[] {
    const params: Record<string, unknown> = { code, source };
    const sql = `SELECT * FROM daily_bars b WHERE b.code = @code AND b.source = @source${this.rangeClause(range, params)} ORDER BY b.date`;
    return (this.db.prepare(sql).all(params) as Row[]).map(rowToBar);
  }

  findMergedByDate(date: string): DailyBar[] {
    const sql = `SELECT * FROM daily_bars b WHERE b.date = @date AND ${MERGED_FILTER} ORDER BY b.code`;
    return (this.db.prepare(sql).all({ date }) as Row[]).map(rowToBar);
  }

  findLatestMerged(codes: string[]): Map<string, DailyBar> {
    const out = new Map<string, DailyBar>();
    const stmt = this.db.prepare(
      `SELECT * FROM daily_bars b WHERE b.code = @code AND ${MERGED_FILTER} ORDER BY b.date DESC LIMIT 1`,
    );
    for (const code of codes) {
      const r = stmt.get({ code }) as Row | undefined;
      if (r) out.set(code, rowToBar(r));
    }
    return out;
  }

  coverageBySource(): SourceCoverage[] {
    const rows = this.db
      .prepare(
        `SELECT source, COUNT(*) AS rows, COUNT(DISTINCT code) AS codes, MIN(date) AS min_date, MAX(date) AS max_date
         FROM daily_bars GROUP BY source ORDER BY ${PRIORITY_SQL}`,
      )
      .all() as { source: BarSource; rows: number; codes: number; min_date: string | null; max_date: string | null }[];
    return rows.map((r) => ({ source: r.source, rows: r.rows, codes: r.codes, minDate: r.min_date, maxDate: r.max_date }));
  }

  coverageByCode(codes?: string[]): CodeCoverage[] {
    const rows = this.db
      .prepare(
        `SELECT code, COUNT(*) AS rows, MIN(date) AS min_date, MAX(date) AS max_date,
                GROUP_CONCAT(DISTINCT source) AS sources
         FROM daily_bars GROUP BY code ORDER BY code`,
      )
      .all() as { code: string; rows: number; min_date: string | null; max_date: string | null; sources: string }[];
    const filter = codes ? new Set(codes) : null;
    return rows
      .filter((r) => !filter || filter.has(r.code))
      .map((r) => ({
        code: r.code,
        rows: r.rows,
        minDate: r.min_date,
        maxDate: r.max_date,
        sources: r.sources.split(",") as BarSource[],
      }));
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM daily_bars").get() as { n: number }).n;
  }
}
