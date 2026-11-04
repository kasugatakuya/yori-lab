import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from "../schema";

export type SqliteDb = Database.Database;

export interface OpenOptions {
  /** ":memory:" でインメモリ（テスト用） */
  path: string;
  readonly?: boolean;
}

export function openDatabase(opts: OpenOptions): SqliteDb {
  if (opts.path !== ":memory:") {
    fs.mkdirSync(path.dirname(opts.path), { recursive: true });
  }
  const db = new Database(opts.path, { readonly: opts.readonly ?? false });
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  if (!opts.readonly) migrate(db);
  return db;
}

export function migrate(db: SqliteDb): number {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current >= LATEST_SCHEMA_VERSION) return current;
  const run = db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    }
  });
  run();
  return LATEST_SCHEMA_VERSION;
}

export function databaseFileSize(dbPath: string): number | null {
  try {
    let total = fs.statSync(dbPath).size;
    for (const suffix of ["-wal", "-shm"]) {
      try {
        total += fs.statSync(dbPath + suffix).size;
      } catch {
        /* no file */
      }
    }
    return total;
  } catch {
    return null;
  }
}
