import { addDays, nowIso } from "@/lib/dates";
import type { Repositories } from "@/lib/db/repositories";
import type { JQuantsClient } from "./client";
import { convertCalendarDay, convertDailyBar, convertFinSummary } from "./convert";

/**
 * J-Quants 取得ジョブ。
 * - 進捗は fetch_progress テーブル（job + key）に記録し、途中終了しても次回は未取得分から再開する
 * - 日足は「日付指定で全銘柄一括」を使い、1営業日 = 1リクエスト（ページング分を除く）に抑える
 * - 保存は universe の銘柄に限定（storeAll=true で全銘柄）
 */

export const JOB_DAILY = "jquants:daily";
export const JOB_FINS = "jquants:fins";
export const JOB_CALENDAR = "jquants:calendar";

export const META_DAILY_LAST_DATE = "jquants.daily.last_date";
export const META_DAILY_WINDOW = "jquants.daily.window";
export const META_FINS_LAST_RUN = "jquants.fins.last_run";

export type JobLogger = (msg: string) => void;

export interface DailyFetchOptions {
  from: string;
  to: string;
  /** 保存対象の銘柄（4桁コード）。storeAll のときは無視 */
  universeCodes: string[];
  storeAll?: boolean;
  /** 1回の実行で処理する営業日数の上限（0 = 無制限） */
  maxDays?: number;
  /** 進捗済みの日付も再取得する */
  force?: boolean;
  /** 中断用 */
  signal?: AbortSignal;
  log?: JobLogger;
  now?: () => string;
}

export interface DailyFetchResult {
  businessDays: number;
  fetchedDays: number;
  skippedDays: number;
  storedRows: number;
  errors: { date: string; message: string }[];
  aborted: boolean;
  lastDate: string | null;
}

/** カレンダーが範囲を覆っていなければ取得する（1リクエスト） */
export async function ensureCalendar(
  client: JQuantsClient,
  repos: Repositories,
  range: { from: string; to: string },
  log: JobLogger = () => undefined,
): Promise<number> {
  const cov = repos.calendar.coverage();
  const covered = cov.minDate !== null && cov.maxDate !== null && cov.minDate <= range.from && cov.maxDate >= range.to;
  if (covered) return 0;
  // 既存範囲と合わせて広めに取る（取得は1回で済む）
  const from = cov.minDate && cov.minDate < range.from ? cov.minDate : range.from;
  const to = cov.maxDate && cov.maxDate > range.to ? cov.maxDate : range.to;
  log(`calendar: fetching ${from}..${to}`);
  const raw = await client.getCalendar({ from, to });
  const days = raw.map(convertCalendarDay);
  const n = repos.calendar.upsertMany(days);
  repos.fetchProgress.set({ job: JOB_CALENDAR, key: `${from}..${to}`, status: "done", rows: n });
  log(`calendar: stored ${n} days`);
  return n;
}

export async function runDailyFetch(client: JQuantsClient, repos: Repositories, opts: DailyFetchOptions): Promise<DailyFetchResult> {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? nowIso;
  const result: DailyFetchResult = {
    businessDays: 0,
    fetchedDays: 0,
    skippedDays: 0,
    storedRows: 0,
    errors: [],
    aborted: false,
    lastDate: repos.fetchProgress.lastDoneKey(JOB_DAILY),
  };
  if (opts.from > opts.to) {
    log(`daily: nothing to do (from ${opts.from} > to ${opts.to})`);
    return result;
  }

  await ensureCalendar(client, repos, { from: opts.from, to: opts.to }, log);
  const days = repos.calendar.businessDays({ from: opts.from, to: opts.to });
  result.businessDays = days.length;
  const done = new Set(opts.force ? [] : repos.fetchProgress.listDone(JOB_DAILY));
  const todo = days.filter((d) => !done.has(d));
  result.skippedDays = days.length - todo.length;
  const limited = opts.maxDays && opts.maxDays > 0 ? todo.slice(0, opts.maxDays) : todo;
  const universe = new Set(opts.universeCodes);
  log(`daily: ${days.length} business days in ${opts.from}..${opts.to}, ${todo.length} to fetch${limited.length < todo.length ? ` (this run: ${limited.length})` : ""}`);

  repos.meta.set(META_DAILY_WINDOW, JSON.stringify({ from: opts.from, to: opts.to }));

  const startedAt = Date.now();
  for (let i = 0; i < limited.length; i++) {
    if (opts.signal?.aborted) {
      result.aborted = true;
      log("daily: aborted by signal");
      break;
    }
    const date = limited[i];
    try {
      const raw = await client.getDailyBars({ date });
      const fetchedAt = now();
      const bars = raw.map((r) => convertDailyBar(r, fetchedAt)).filter((b) => opts.storeAll || universe.has(b.code));
      const stored = repos.transaction(() => {
        const n = repos.dailyBars.upsertMany(bars);
        repos.fetchProgress.set({ job: JOB_DAILY, key: date, status: "done", rows: n });
        return n;
      });
      result.fetchedDays++;
      result.storedRows += stored;
      result.lastDate = result.lastDate && result.lastDate > date ? result.lastDate : date;
      repos.meta.set(META_DAILY_LAST_DATE, repos.fetchProgress.lastDoneKey(JOB_DAILY) ?? date);
      const elapsed = (Date.now() - startedAt) / 1000;
      const perDay = elapsed / (i + 1);
      const etaMin = Math.round((perDay * (limited.length - i - 1)) / 60);
      log(`daily: ${date} ok (${raw.length} rows from API, ${stored} stored) [${i + 1}/${limited.length}, ETA ${etaMin} min]`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push({ date, message });
      repos.fetchProgress.set({ job: JOB_DAILY, key: date, status: "error", message });
      log(`daily: ${date} ERROR ${message}`);
      // 認証エラー等は続けても無駄なので中断
      if (/HTTP 40[13]/.test(message)) {
        result.aborted = true;
        break;
      }
    }
  }
  return result;
}

export interface FinsFetchOptions {
  codes: string[];
  force?: boolean;
  signal?: AbortSignal;
  log?: JobLogger;
  now?: () => string;
}

export interface FinsFetchResult {
  codes: number;
  fetched: number;
  skipped: number;
  storedRows: number;
  errors: { code: string; message: string }[];
  aborted: boolean;
}

/** 財務サマリーを銘柄ごとに取得（1銘柄 = 1リクエスト）。進捗は銘柄コード単位 */
export async function runFinsFetch(client: JQuantsClient, repos: Repositories, opts: FinsFetchOptions): Promise<FinsFetchResult> {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? nowIso;
  const done = new Set(opts.force ? [] : repos.fetchProgress.listDone(JOB_FINS));
  const todo = opts.codes.filter((c) => !done.has(c));
  const result: FinsFetchResult = { codes: opts.codes.length, fetched: 0, skipped: opts.codes.length - todo.length, storedRows: 0, errors: [], aborted: false };
  log(`fins: ${opts.codes.length} codes, ${todo.length} to fetch`);
  for (let i = 0; i < todo.length; i++) {
    if (opts.signal?.aborted) {
      result.aborted = true;
      break;
    }
    const code = todo[i];
    try {
      const raw = await client.getFinSummary({ code });
      const fetchedAt = now();
      const rows = raw.map((r) => convertFinSummary(r, fetchedAt));
      const n = repos.transaction(() => {
        const stored = repos.finSummaries.upsertMany(rows);
        repos.fetchProgress.set({ job: JOB_FINS, key: code, status: "done", rows: stored });
        return stored;
      });
      result.fetched++;
      result.storedRows += n;
      log(`fins: ${code} ok (${n} rows) [${i + 1}/${todo.length}]`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push({ code, message });
      repos.fetchProgress.set({ job: JOB_FINS, key: code, status: "error", message });
      log(`fins: ${code} ERROR ${message}`);
      if (/HTTP 40[13]/.test(message)) {
        result.aborted = true;
        break;
      }
    }
  }
  repos.meta.set(META_FINS_LAST_RUN, now());
  return result;
}

/** 差分取得の開始日: 最後に取得済みの営業日の翌日。無ければ window.from */
export function resolveIncrementalFrom(repos: Repositories, windowFrom: string): string {
  const last = repos.fetchProgress.lastDoneKey(JOB_DAILY);
  if (!last) return windowFrom;
  const next = addDays(last, 1);
  return next > windowFrom ? next : windowFrom;
}
