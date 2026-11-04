import type { JQuantsPlan } from "@/lib/config";
import { addWeeks, addYears } from "@/lib/dates";

export interface AvailableWindow {
  /** 取得可能な最古日 */
  from: string;
  /** 取得可能な最新日（Free は12週間遅延） */
  to: string;
  plan: JQuantsPlan;
  delayWeeks: number;
}

/**
 * プラン別の取得可能期間（公式: /ja/spec/data-spec）
 * - Free: 12週間前 〜 2年12週間前
 * - Light: 5年前まで / Standard: 10年前まで / Premium: 20年前まで（遅延なし）
 * 株価四本値・取引カレンダー・財務情報・上場銘柄一覧は同じ表に従う。
 */
export function getAvailableWindow(plan: JQuantsPlan, today: string): AvailableWindow {
  switch (plan) {
    case "free":
      return { from: addWeeks(addYears(today, -2), -12), to: addWeeks(today, -12), plan, delayWeeks: 12 };
    case "light":
      return { from: addYears(today, -5), to: today, plan, delayWeeks: 0 };
    case "standard":
      return { from: addYears(today, -10), to: today, plan, delayWeeks: 0 };
    case "premium":
      return { from: addYears(today, -20), to: today, plan, delayWeeks: 0 };
  }
}
