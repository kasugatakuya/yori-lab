import type { CalendarRepository } from "../repositories";
import type { CalendarDay, DateRange } from "../types";
import { nowIso } from "@/lib/dates";
import type { SqliteDb } from "./connection";

export class SqliteCalendarRepository implements CalendarRepository {
  private readonly insert;
  constructor(private readonly db: SqliteDb) {
    this.insert = db.prepare(
      `INSERT INTO trading_calendar (date, hol_div, fetched_at) VALUES (@date, @hol_div, @fetched_at)
       ON CONFLICT (date) DO UPDATE SET hol_div = excluded.hol_div, fetched_at = excluded.fetched_at`,
    );
  }

  upsertMany(days: CalendarDay[]): number {
    const fetched_at = nowIso();
    const tx = this.db.transaction((rows: CalendarDay[]) => {
      for (const d of rows) this.insert.run({ date: d.date, hol_div: d.holDiv, fetched_at });
      return rows.length;
    });
    return tx(days);
  }

  find(range: DateRange): CalendarDay[] {
    const params: Record<string, unknown> = {};
    let where = "1=1";
    if (range.from) {
      where += " AND date >= @from";
      params.from = range.from;
    }
    if (range.to) {
      where += " AND date <= @to";
      params.to = range.to;
    }
    return this.db
      .prepare(`SELECT date, hol_div AS holDiv FROM trading_calendar WHERE ${where} ORDER BY date`)
      .all(params) as CalendarDay[];
  }

  businessDays(range: DateRange): string[] {
    return this.find(range)
      .filter((d) => d.holDiv === "1" || d.holDiv === "2")
      .map((d) => d.date);
  }

  coverage() {
    const r = this.db
      .prepare("SELECT MIN(date) AS min_date, MAX(date) AS max_date, COUNT(*) AS rows FROM trading_calendar")
      .get() as { min_date: string | null; max_date: string | null; rows: number };
    return { minDate: r.min_date, maxDate: r.max_date, rows: r.rows };
  }
}
