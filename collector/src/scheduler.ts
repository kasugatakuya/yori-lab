import type { CollectorConfig } from "./config";

export type Phase = "idle" | "prepare" | "recording" | "wait-close" | "daily-bar" | "done";

/**
 * 当日の秒数から現在のフェーズを決める（純粋関数）。
 * idle → prepare（認証・接続・登録）→ recording（8:00〜9:30）→ wait-close → daily-bar（15:40）→ done
 */
export function phaseAt(sec: number, c: Pick<CollectorConfig, "authAfterSec" | "startSec" | "endSec" | "dailyBarAtSec" | "prepareLeadSec">, dailyBarDone: boolean): Phase {
  if (sec < c.authAfterSec) return "idle";
  if (sec < c.startSec - c.prepareLeadSec) return "idle";
  if (sec < c.startSec) return "prepare";
  if (sec < c.endSec) return "recording";
  if (sec < c.dailyBarAtSec) return "wait-close";
  return dailyBarDone ? "done" : "daily-bar";
}

export function isWeekend(ymd: string): boolean {
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}
