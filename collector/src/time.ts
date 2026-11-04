/** JST の時刻ユーティリティ（collector はローカル PC の時計に依存せず JST で判断する） */

const JST_MS = 9 * 60 * 60 * 1000;

export function nowJstIso(d: Date = new Date()): string {
  const j = new Date(d.getTime() + JST_MS);
  const ms = String(j.getUTCMilliseconds()).padStart(3, "0");
  return `${j.toISOString().slice(0, 19).replace(/\.\d{3}$/, "")}.${ms}+09:00`.replace("Z", "");
}

/** "YYYY-MM-DD"（JST） */
export function jstDate(d: Date = new Date()): string {
  return new Date(d.getTime() + JST_MS).toISOString().slice(0, 10);
}

/** 当日 0:00 JST からの秒数 */
export function jstSecondsOfDay(d: Date = new Date()): number {
  const j = new Date(d.getTime() + JST_MS);
  return j.getUTCHours() * 3600 + j.getUTCMinutes() * 60 + j.getUTCSeconds();
}

/** "HH:MM" / "HH:MM:SS" → 秒 */
export function parseHms(s: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) throw new Error(`invalid time: ${s}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

/** JST の日付と秒から Date を作る */
export function jstDateTime(ymd: string, secondsOfDay: number): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, secondsOfDay) - JST_MS);
}

/** ISO 文字列（JST）を分単位に切り下げた ISO（バー開始時刻）にする */
export function floorToMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  const j = new Date(d.getTime() + JST_MS);
  const totalMin = j.getUTCHours() * 60 + j.getUTCMinutes();
  const floored = Math.floor(totalMin / minutes) * minutes;
  const hh = String(Math.floor(floored / 60)).padStart(2, "0");
  const mm = String(floored % 60).padStart(2, "0");
  return `${j.toISOString().slice(0, 10)}T${hh}:${mm}:00+09:00`;
}
