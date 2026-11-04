/**
 * J-Quants から日足（＋取引カレンダー）を取得して SQLite にキャッシュする。
 *
 *   pnpm fetch:daily                 # 差分取得（前回の続きから、取得可能な最新日まで）
 *   pnpm fetch:daily --from 2025-01-01 --to 2025-03-31
 *   pnpm fetch:daily --max-days 50   # 1回の実行で処理する営業日数を制限（途中から再開できる）
 *   pnpm fetch:daily --force         # 取得済みの日も再取得（調整済み株価の再計算を反映したいとき）
 *   pnpm fetch:daily --all           # universe 以外の全銘柄も保存
 *
 * Free プランは 5件/分・12週間遅延。初回の全期間取得は約490営業日で 100 分前後かかる。
 * Ctrl+C で安全に中断でき、次回は未取得の営業日から再開する。
 */
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { normalizeYmd, todayJst } from "@/lib/dates";
import { openSqliteRepositories } from "@/lib/db";
import { JQuantsClient } from "@/lib/jquants/client";
import { resolveIncrementalFrom, runDailyFetch } from "@/lib/jquants/jobs";
import { getAvailableWindow } from "@/lib/jquants/plan";
import { loadUniverse } from "@/lib/universe";
import { abortOnSignal, createLogger, loadDotenv, parseArgs } from "./lib/cli";

async function main() {
  loadDotenv(path.resolve(process.cwd(), ".env"));
  const { flags } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  if (!config.jquants.apiKey) {
    console.error("JQUANTS_API_KEY が設定されていません（.env を参照）");
    process.exit(2);
  }
  const log = createLogger("fetch-daily");
  const today = todayJst();
  const window = getAvailableWindow(config.jquants.plan, today);
  const repos = openSqliteRepositories(config.dbPath);
  const universe = loadUniverse();

  const to = typeof flags.to === "string" ? normalizeYmd(flags.to) : window.to;
  const from = typeof flags.from === "string" ? normalizeYmd(flags.from) : resolveIncrementalFrom(repos, window.from);
  const maxDays = typeof flags["max-days"] === "string" ? Number(flags["max-days"]) : 0;

  log(`plan=${config.jquants.plan} rate=${config.jquants.ratePerMinute}/min window=${window.from}..${window.to} (delay ${window.delayWeeks}w)`);
  log(`db=${config.dbPath} universe=${universe.stocks.length} codes range=${from}..${to}`);

  const client = new JQuantsClient({
    apiKey: config.jquants.apiKey,
    baseUrl: config.jquants.baseUrl,
    ratePerMinute: config.jquants.ratePerMinute,
    finsRatePerMinute: config.jquants.finsRatePerMinute,
    logger: (m) => log(`[client] ${m}`),
  });

  const result = await runDailyFetch(client, repos, {
    from,
    to,
    universeCodes: universe.stocks.map((s) => s.code),
    storeAll: flags.all === true,
    force: flags.force === true,
    maxDays,
    signal: abortOnSignal(),
    log,
  });
  log(`done: businessDays=${result.businessDays} fetched=${result.fetchedDays} skipped=${result.skippedDays} stored=${result.storedRows} errors=${result.errors.length} requests=${client.requestCount}${result.aborted ? " (aborted)" : ""}`);
  for (const e of result.errors) log(`  error ${e.date}: ${e.message}`);
  repos.close();
  process.exit(result.errors.length > 0 || result.aborted ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
