/**
 * APIキーなしで画面を確認するためのモックデータを生成する。
 *   pnpm seed:mock            # data/db/mock.sqlite に生成
 *   YORI_DB_PATH=./data/db/mock.sqlite pnpm dev
 * 実DBに混ぜないよう、既定の出力先は mock.sqlite 固定。
 */
import path from "node:path";
import { addDays } from "@/lib/dates";
import { openSqliteRepositories, type DailyBar } from "@/lib/db";
import { JOB_DAILY, META_DAILY_LAST_DATE } from "@/lib/jquants/jobs";
import { loadUniverse } from "@/lib/universe";

const dbPath = path.resolve(process.cwd(), "data/db/mock.sqlite");
const repos = openSqliteRepositories(dbPath);
const universe = loadUniverse();

// 決定的な疑似乱数
let seed = 12345;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const start = "2024-08-05";
const end = "2026-08-06";
const days: string[] = [];
for (let d = start; d <= end; d = addDays(d, 1)) {
  const dow = new Date(d).getUTCDay();
  const biz = dow !== 0 && dow !== 6;
  repos.calendar.upsertMany([{ date: d, holDiv: biz ? "1" : "0" }]);
  if (biz) days.push(d);
}

const bars: DailyBar[] = [];
for (const s of universe.stocks) {
  let price = 1000 + rand() * 9000;
  for (const date of days) {
    const gap = (rand() - 0.5) * 0.03;
    const open = Math.round(price * (1 + gap) * 10) / 10;
    const drift = (rand() - 0.5) * 0.04;
    const close = Math.round(open * (1 + drift) * 10) / 10;
    const high = Math.round(Math.max(open, close) * (1 + rand() * 0.01) * 10) / 10;
    const low = Math.round(Math.min(open, close) * (1 - rand() * 0.01) * 10) / 10;
    const volume = Math.round(1_000_000 + rand() * 5_000_000);
    bars.push({
      code: s.code,
      date,
      source: "jquants",
      open,
      high,
      low,
      close,
      volume,
      turnover: Math.round(volume * (open + close) / 2),
      adjFactor: 1,
      adjOpen: open,
      adjHigh: high,
      adjLow: low,
      adjClose: close,
      adjVolume: volume,
      upperLimit: false,
      lowerLimit: false,
      fetchedAt: new Date().toISOString(),
    });
    price = close;
  }
  // 直近分は kabu / yahoo 由来として数日分だけ
  const last = bars[bars.length - 1];
  for (let i = 1; i <= 8; i++) {
    const date = addDays(end, i * 1 + Math.floor(i / 5) * 2);
    bars.push({ ...last, date, source: i <= 5 ? "yahoo" : "kabu", close: Math.round((last.close ?? 0) * (1 + (rand() - 0.5) * 0.02) * 10) / 10 });
  }
}
repos.transaction(() => {
  repos.dailyBars.upsertMany(bars);
  for (const d of days) repos.fetchProgress.set({ job: JOB_DAILY, key: d, status: "done", rows: universe.stocks.length });
  repos.meta.set(META_DAILY_LAST_DATE, end);
  repos.meta.set("mock", "true");
});
console.log(`mock db written: ${dbPath} (${bars.length} bars, ${days.length} business days)`);
repos.close();
