/**
 * Yahoo Finance 非公式 API から日足（直近3ヶ月）と5分足（直近5日）を補完取得する（任意）。
 *   pnpm fetch:yahoo                 # universe 全銘柄
 *   pnpm fetch:yahoo --codes 7203,8306
 *   pnpm fetch:yahoo --no-minute     # 日足のみ
 * 失敗した銘柄はスキップして続行する。出所 yahoo は J-Quants / kabu より優先度が低い。
 */
import path from "node:path";
import { normalizeCode } from "@/lib/codes";
import { loadConfig } from "@/lib/config";
import { openSqliteRepositories } from "@/lib/db";
import { loadUniverse } from "@/lib/universe";
import { YahooClient } from "@/lib/yahoo/client";
import { createLogger, loadDotenv, parseArgs } from "./lib/cli";

async function main() {
  loadDotenv(path.resolve(process.cwd(), ".env"));
  const { flags } = parseArgs(process.argv.slice(2));
  const log = createLogger("fetch-yahoo");
  const repos = openSqliteRepositories(loadConfig().dbPath);
  const universe = loadUniverse();
  const codes = typeof flags.codes === "string" ? flags.codes.split(/[,\s]+/).map(normalizeCode).filter(Boolean) : universe.stocks.map((s) => s.code);
  const client = new YahooClient();
  let ok = 0;
  let failed = 0;
  let daily = 0;
  let minute = 0;
  for (const code of codes) {
    try {
      const bars = await client.dailyBars(code);
      daily += repos.dailyBars.upsertMany(bars);
      if (flags["no-minute"] !== true) {
        const m5 = await client.fiveMinuteBars(code);
        minute += repos.minuteBars.upsertMany(m5);
      }
      ok++;
      log(`${code}: ok (daily ${bars.length})`);
    } catch (e) {
      failed++;
      log(`${code}: FAILED ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  repos.meta.set("yahoo.last_run", new Date().toISOString());
  log(`done: ok=${ok} failed=${failed} dailyRows=${daily} minuteRows=${minute}`);
  repos.close();
  process.exit(failed > 0 && ok === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
