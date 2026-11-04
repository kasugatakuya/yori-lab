/**
 * J-Quants から財務サマリー（発行済株式数・EPS 等）を universe の銘柄ごとに取得する。
 *
 *   pnpm fetch:fins            # 未取得の銘柄のみ
 *   pnpm fetch:fins --force    # 全銘柄再取得
 *
 * 1銘柄 = 1リクエスト。Free プラン（5件/分）で 200 銘柄なら約 40 分。
 */
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { openSqliteRepositories } from "@/lib/db";
import { JQuantsClient } from "@/lib/jquants/client";
import { runFinsFetch } from "@/lib/jquants/jobs";
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
  const log = createLogger("fetch-fins");
  const repos = openSqliteRepositories(config.dbPath);
  const universe = loadUniverse();
  const client = new JQuantsClient({
    apiKey: config.jquants.apiKey,
    baseUrl: config.jquants.baseUrl,
    ratePerMinute: config.jquants.ratePerMinute,
    finsRatePerMinute: config.jquants.finsRatePerMinute,
    logger: (m) => log(`[client] ${m}`),
  });
  const result = await runFinsFetch(client, repos, {
    codes: universe.stocks.map((s) => s.code),
    force: flags.force === true,
    signal: abortOnSignal(),
    log,
  });
  log(`done: codes=${result.codes} fetched=${result.fetched} skipped=${result.skipped} stored=${result.storedRows} errors=${result.errors.length}${result.aborted ? " (aborted)" : ""}`);
  repos.close();
  process.exit(result.errors.length > 0 || result.aborted ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
