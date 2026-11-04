import { normalizeCode } from "@/lib/codes";
import { normalizeYmd } from "@/lib/dates";
import type { CalendarDay, DailyBar, FinSummary } from "@/lib/db/types";
import type { RawCalendarDay, RawDailyBar, RawFinSummary, RawNumber } from "./types";

/**
 * J-Quants V2 の値は number でも文字列でも来る（財務は基本すべて文字列、"" は記載なし）。
 * 型変換はこのファイルに集約する。
 */
export function toNum(v: RawNumber | unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "" || s === "-" || s.toLowerCase() === "null") return null;
    const n = Number(s.replaceAll(",", ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** "0" / "1" / true / false → boolean。不明は null */
export function toFlag(v: unknown): boolean | null {
  if (v === "1" || v === 1 || v === true) return true;
  if (v === "0" || v === 0 || v === false) return false;
  return null;
}

export function toYmdOrNull(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  try {
    return normalizeYmd(v);
  } catch {
    return null;
  }
}

export function convertDailyBar(raw: RawDailyBar, fetchedAt: string): DailyBar {
  return {
    code: normalizeCode(raw.Code),
    date: normalizeYmd(raw.Date),
    source: "jquants",
    open: toNum(raw.O),
    high: toNum(raw.H),
    low: toNum(raw.L),
    close: toNum(raw.C),
    volume: toNum(raw.Vo),
    turnover: toNum(raw.Va),
    adjFactor: toNum(raw.AdjFactor),
    adjOpen: toNum(raw.AdjO),
    adjHigh: toNum(raw.AdjH),
    adjLow: toNum(raw.AdjL),
    adjClose: toNum(raw.AdjC),
    adjVolume: toNum(raw.AdjVo),
    upperLimit: toFlag(raw.UL),
    lowerLimit: toFlag(raw.LL),
    fetchedAt,
  };
}

export function convertCalendarDay(raw: RawCalendarDay): CalendarDay {
  const h = String(raw.HolDiv);
  if (h !== "0" && h !== "1" && h !== "2" && h !== "3") throw new Error(`unknown HolDiv: ${raw.HolDiv}`);
  return { date: normalizeYmd(raw.Date), holDiv: h };
}

export function convertFinSummary(raw: RawFinSummary, fetchedAt: string): FinSummary {
  return {
    code: normalizeCode(raw.Code),
    discDate: normalizeYmd(raw.DiscDate),
    discTime: String(raw.DiscTime ?? ""),
    docType: String(raw.DocType ?? ""),
    curPerType: String(raw.CurPerType ?? ""),
    curFyStart: toYmdOrNull(raw.CurFYSt),
    curFyEnd: toYmdOrNull(raw.CurFYEn),
    sharesOutstanding: toNum(raw.ShOutFY),
    treasuryShares: toNum(raw.TrShFY),
    avgShares: toNum(raw.AvgSh),
    eps: toNum(raw.EPS),
    bps: toNum(raw.BPS),
    sales: toNum(raw.Sales),
    operatingProfit: toNum(raw.OP),
    ordinaryProfit: toNum(raw.OdP),
    netProfit: toNum(raw.NP),
    raw: JSON.stringify(raw),
    fetchedAt,
  };
}
