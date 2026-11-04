import type { Repositories } from "../repositories";
import { SqliteBoardDayInfoRepository, SqliteBoardSnapshotRepository, SqliteCollectorStatusRepository, SqliteMinuteBarRepository, SqliteTradeRepository } from "./board-repositories";
import { SqliteCalendarRepository } from "./calendar-repository";
import { openDatabase, type SqliteDb } from "./connection";
import { SqliteDailyBarRepository } from "./daily-bar-repository";
import { SqliteFetchProgressRepository } from "./fetch-progress-repository";
import { SqliteFinSummaryRepository } from "./fin-summary-repository";
import { SqliteMetaRepository } from "./meta-repository";

export function createSqliteRepositories(db: SqliteDb): Repositories {
  return {
    dailyBars: new SqliteDailyBarRepository(db),
    calendar: new SqliteCalendarRepository(db),
    finSummaries: new SqliteFinSummaryRepository(db),
    fetchProgress: new SqliteFetchProgressRepository(db),
    meta: new SqliteMetaRepository(db),
    boardSnapshots: new SqliteBoardSnapshotRepository(db),
    boardDayInfo: new SqliteBoardDayInfoRepository(db),
    trades: new SqliteTradeRepository(db),
    minuteBars: new SqliteMinuteBarRepository(db),
    collector: new SqliteCollectorStatusRepository(db),
    transaction: <T>(fn: () => T): T => db.transaction(fn)(),
    checkpoint: () => {
      db.pragma("wal_checkpoint(TRUNCATE)");
    },
    close: () => db.close(),
  };
}

/** ファイルパスから SQLite リポジトリ群を開く。":memory:" でテスト用インメモリ */
export function openSqliteRepositories(dbPath: string, opts: { readonly?: boolean } = {}): Repositories {
  return createSqliteRepositories(openDatabase({ path: dbPath, readonly: opts.readonly }));
}
