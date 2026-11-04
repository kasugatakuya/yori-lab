import type { FetchProgressRepository } from "../repositories";
import type { FetchProgress, FetchStatus } from "../types";
import { nowIso } from "@/lib/dates";
import type { SqliteDb } from "./connection";

interface Row {
  job: string;
  key: string;
  status: FetchStatus;
  rows: number;
  message: string | null;
  updated_at: string;
}

export class SqliteFetchProgressRepository implements FetchProgressRepository {
  constructor(private readonly db: SqliteDb) {}

  get(job: string, key: string): FetchProgress | null {
    const r = this.db.prepare("SELECT * FROM fetch_progress WHERE job = ? AND key = ?").get(job, key) as Row | undefined;
    return r ? { job: r.job, key: r.key, status: r.status, rows: r.rows, message: r.message, updatedAt: r.updated_at } : null;
  }

  set(p: { job: string; key: string; status: FetchStatus; rows?: number; message?: string | null }): void {
    this.db
      .prepare(
        `INSERT INTO fetch_progress (job, key, status, rows, message, updated_at)
         VALUES (@job, @key, @status, @rows, @message, @updated_at)
         ON CONFLICT (job, key) DO UPDATE SET status = excluded.status, rows = excluded.rows,
           message = excluded.message, updated_at = excluded.updated_at`,
      )
      .run({ job: p.job, key: p.key, status: p.status, rows: p.rows ?? 0, message: p.message ?? null, updated_at: nowIso() });
  }

  listDone(job: string): string[] {
    return (
      this.db.prepare("SELECT key FROM fetch_progress WHERE job = ? AND status = 'done' ORDER BY key").all(job) as { key: string }[]
    ).map((r) => r.key);
  }

  lastDoneKey(job: string): string | null {
    const r = this.db
      .prepare("SELECT MAX(key) AS k FROM fetch_progress WHERE job = ? AND status = 'done'")
      .get(job) as { k: string | null };
    return r.k;
  }

  clear(job: string, keys?: string[]): number {
    if (!keys) return this.db.prepare("DELETE FROM fetch_progress WHERE job = ?").run(job).changes;
    const stmt = this.db.prepare("DELETE FROM fetch_progress WHERE job = ? AND key = ?");
    let n = 0;
    for (const k of keys) n += stmt.run(job, k).changes;
    return n;
  }

  summary(job: string) {
    const r = this.db
      .prepare(
        `SELECT SUM(status = 'done') AS done, SUM(status = 'error') AS error, MAX(updated_at) AS last
         FROM fetch_progress WHERE job = ?`,
      )
      .get(job) as { done: number | null; error: number | null; last: string | null };
    return { done: r.done ?? 0, error: r.error ?? 0, lastUpdatedAt: r.last };
  }
}
