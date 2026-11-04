/**
 * 日付ユーティリティ。アプリ内の日付は "YYYY-MM-DD" 文字列（JST基準の暦日）で扱う。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayJst(now: Date = new Date()): string {
  return toYmd(new Date(now.getTime() + JST_OFFSET_MS));
}

/** Date（UTC値として読む）→ "YYYY-MM-DD" */
export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(ymd: string): Date {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(ymd.trim());
  if (!m) throw new Error(`invalid date: ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** "20260101" / "2026-01-01" → "2026-01-01" */
export function normalizeYmd(s: string): string {
  return toYmd(parseYmd(s));
}

export function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

export function addWeeks(ymd: string, weeks: number): string {
  return addDays(ymd, weeks * 7);
}

export function addYears(ymd: string, years: number): string {
  const d = parseYmd(ymd);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return toYmd(d);
}

export function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxYmd(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

export function minYmd(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}

/** J-Quants の date パラメータ形式（YYYYMMDD） */
export function toCompactYmd(ymd: string): string {
  return normalizeYmd(ymd).replaceAll("-", "");
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}
