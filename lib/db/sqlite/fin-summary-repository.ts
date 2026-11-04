import type { FinSummaryRepository } from "../repositories";
import type { FinSummary } from "../types";
import type { SqliteDb } from "./connection";

interface Row {
  code: string;
  disc_date: string;
  disc_time: string;
  doc_type: string;
  cur_per_type: string;
  cur_fy_start: string | null;
  cur_fy_end: string | null;
  shares_outstanding: number | null;
  treasury_shares: number | null;
  avg_shares: number | null;
  eps: number | null;
  bps: number | null;
  sales: number | null;
  operating_profit: number | null;
  ordinary_profit: number | null;
  net_profit: number | null;
  raw: string;
  fetched_at: string;
}

function rowToFin(r: Row): FinSummary {
  return {
    code: r.code,
    discDate: r.disc_date,
    discTime: r.disc_time,
    docType: r.doc_type,
    curPerType: r.cur_per_type,
    curFyStart: r.cur_fy_start,
    curFyEnd: r.cur_fy_end,
    sharesOutstanding: r.shares_outstanding,
    treasuryShares: r.treasury_shares,
    avgShares: r.avg_shares,
    eps: r.eps,
    bps: r.bps,
    sales: r.sales,
    operatingProfit: r.operating_profit,
    ordinaryProfit: r.ordinary_profit,
    netProfit: r.net_profit,
    raw: r.raw,
    fetchedAt: r.fetched_at,
  };
}

export class SqliteFinSummaryRepository implements FinSummaryRepository {
  private readonly insert;
  constructor(private readonly db: SqliteDb) {
    this.insert = db.prepare(`
      INSERT INTO fin_summaries (code, disc_date, disc_time, doc_type, cur_per_type, cur_fy_start, cur_fy_end,
        shares_outstanding, treasury_shares, avg_shares, eps, bps, sales, operating_profit, ordinary_profit, net_profit, raw, fetched_at)
      VALUES (@code, @disc_date, @disc_time, @doc_type, @cur_per_type, @cur_fy_start, @cur_fy_end,
        @shares_outstanding, @treasury_shares, @avg_shares, @eps, @bps, @sales, @operating_profit, @ordinary_profit, @net_profit, @raw, @fetched_at)
      ON CONFLICT (code, disc_date, disc_time, doc_type) DO UPDATE SET
        cur_per_type = excluded.cur_per_type, cur_fy_start = excluded.cur_fy_start, cur_fy_end = excluded.cur_fy_end,
        shares_outstanding = excluded.shares_outstanding, treasury_shares = excluded.treasury_shares, avg_shares = excluded.avg_shares,
        eps = excluded.eps, bps = excluded.bps, sales = excluded.sales, operating_profit = excluded.operating_profit,
        ordinary_profit = excluded.ordinary_profit, net_profit = excluded.net_profit, raw = excluded.raw, fetched_at = excluded.fetched_at
    `);
  }

  upsertMany(rows: FinSummary[]): number {
    const tx = this.db.transaction((items: FinSummary[]) => {
      for (const f of items) {
        this.insert.run({
          code: f.code,
          disc_date: f.discDate,
          disc_time: f.discTime,
          doc_type: f.docType,
          cur_per_type: f.curPerType,
          cur_fy_start: f.curFyStart,
          cur_fy_end: f.curFyEnd,
          shares_outstanding: f.sharesOutstanding,
          treasury_shares: f.treasuryShares,
          avg_shares: f.avgShares,
          eps: f.eps,
          bps: f.bps,
          sales: f.sales,
          operating_profit: f.operatingProfit,
          ordinary_profit: f.ordinaryProfit,
          net_profit: f.netProfit,
          raw: f.raw,
          fetched_at: f.fetchedAt,
        });
      }
      return items.length;
    });
    return tx(rows);
  }

  findByCode(code: string): FinSummary[] {
    return (
      this.db
        .prepare("SELECT * FROM fin_summaries WHERE code = ? ORDER BY disc_date, disc_time")
        .all(code) as Row[]
    ).map(rowToFin);
  }

  latestByCode(code: string): FinSummary | null {
    const r = this.db
      .prepare(
        "SELECT * FROM fin_summaries WHERE code = ? AND shares_outstanding IS NOT NULL ORDER BY disc_date DESC, disc_time DESC LIMIT 1",
      )
      .get(code) as Row | undefined;
    return r ? rowToFin(r) : null;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM fin_summaries").get() as { n: number }).n;
  }
}
