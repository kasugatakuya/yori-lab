import type { MetaRepository } from "../repositories";
import { nowIso } from "@/lib/dates";
import type { SqliteDb } from "./connection";

export class SqliteMetaRepository implements MetaRepository {
  constructor(private readonly db: SqliteDb) {}
  get(key: string): string | null {
    const r = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }
  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, nowIso());
  }
  all(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.db.prepare("SELECT key, value FROM meta ORDER BY key").all() as { key: string; value: string }[]) {
      out[r.key] = r.value;
    }
    return out;
  }
}
