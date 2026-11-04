import type {
  BarSource,
  BoardDayInfo,
  BoardSnapshot,
  CalendarDay,
  CodeCoverage,
  CollectorDailyStats,
  CollectorGap,
  CollectorSession,
  DailyBar,
  DateRange,
  FetchProgress,
  FetchStatus,
  FinSummary,
  MinuteBar,
  SourceCoverage,
  Trade,
} from "./types";

/**
 * リポジトリ層インターフェース。
 * UI・分析・スクリプトはこのインターフェースだけに依存し、SQLite 実装（lib/db/sqlite）を
 * 後から DuckDB/Parquet 等のローカル実装に差し替えられるようにする。
 */

export interface DailyBarRepository {
  /** 同一 (code, date, source) は上書き */
  upsertMany(bars: DailyBar[]): number;
  /** 出所優先順位（jquants > kabu > yahoo）でマージした1本/日の系列（日付昇順） */
  findMerged(code: string, range?: DateRange): DailyBar[];
  /** 出所を限定して取得 */
  findBySource(code: string, source: BarSource, range?: DateRange): DailyBar[];
  /** 指定日の全銘柄（マージ済み） */
  findMergedByDate(date: string): DailyBar[];
  /** 銘柄ごとの直近1本（マージ済み） */
  findLatestMerged(codes: string[]): Map<string, DailyBar>;
  coverageBySource(): SourceCoverage[];
  coverageByCode(codes?: string[]): CodeCoverage[];
  count(): number;
}

export interface CalendarRepository {
  upsertMany(days: CalendarDay[]): number;
  find(range: DateRange): CalendarDay[];
  /** 東証営業日（休日区分 1, 2）だけを返す */
  businessDays(range: DateRange): string[];
  coverage(): { minDate: string | null; maxDate: string | null; rows: number };
}

export interface FinSummaryRepository {
  upsertMany(rows: FinSummary[]): number;
  findByCode(code: string): FinSummary[];
  /** 銘柄ごとの最新の発行済株式数（期末発行済株式数 − 自己株式数ではなく、生の値を返す） */
  latestByCode(code: string): FinSummary | null;
  count(): number;
}

export interface FetchProgressRepository {
  get(job: string, key: string): FetchProgress | null;
  set(p: { job: string; key: string; status: FetchStatus; rows?: number; message?: string | null }): void;
  listDone(job: string): string[];
  lastDoneKey(job: string): string | null;
  clear(job: string, keys?: string[]): number;
  summary(job: string): { done: number; error: number; lastUpdatedAt: string | null };
}

export interface MetaRepository {
  get(key: string): string | null;
  set(key: string, value: string): void;
  all(): Record<string, string>;
}

export interface Repositories {
  dailyBars: DailyBarRepository;
  calendar: CalendarRepository;
  finSummaries: FinSummaryRepository;
  fetchProgress: FetchProgressRepository;
  meta: MetaRepository;
  boardSnapshots: BoardSnapshotRepository;
  boardDayInfo: BoardDayInfoRepository;
  trades: TradeRepository;
  minuteBars: MinuteBarRepository;
  collector: CollectorStatusRepository;
  /** 複数の書き込みを1トランザクションで行う */
  transaction<T>(fn: () => T): T;
  /** WAL をチェックポイントしてファイルサイズを実体に合わせる（容量計測の前に呼ぶ） */
  checkpoint(): void;
  close(): void;
}

// ---- 板・約定・分足・収集状況 ----

export interface BoardSnapshotRepository {
  insertMany(rows: BoardSnapshot[]): number;
  find(code: string, tradeDate: string, range?: { from?: string; to?: string }): BoardSnapshot[];
  /** 記録がある日付（降順） */
  listDates(code?: string): string[];
  listCodes(tradeDate: string): string[];
  countByDate(tradeDate: string): number;
  deleteByDate(tradeDate: string): number;
}

export interface BoardDayInfoRepository {
  upsertMany(rows: BoardDayInfo[]): number;
  findByDate(tradeDate: string): BoardDayInfo[];
  get(tradeDate: string, code: string): BoardDayInfo | null;
  latestDate(): string | null;
}

export interface TradeRepository {
  insertMany(rows: Trade[]): number;
  find(code: string, tradeDate: string): Trade[];
  nextSeq(code: string, tradeDate: string): number;
  countByDate(tradeDate: string): number;
  deleteByDate(tradeDate: string): number;
}

export interface MinuteBarRepository {
  upsertMany(rows: MinuteBar[]): number;
  find(code: string, tradeDate: string, intervalMin: 1 | 5, source?: MinuteBar["source"]): MinuteBar[];
  listDates(code: string): string[];
}

export interface CollectorStatusRepository {
  startSession(tradeDate: string, symbolCount: number, note?: string): number;
  touchSession(id: number, lastMessageAt: string, symbolCount?: number): void;
  endSession(id: number, endedAt: string, note?: string): void;
  latestSession(): CollectorSession | null;
  listSessions(limit?: number): CollectorSession[];
  openGap(tradeDate: string, startedAt: string, reason: string): number;
  closeGap(id: number, endedAt: string): void;
  listGaps(tradeDate?: string, limit?: number): CollectorGap[];
  upsertDailyStats(s: Omit<CollectorDailyStats, "updatedAt">): void;
  listDailyStats(limit?: number): CollectorDailyStats[];
}
