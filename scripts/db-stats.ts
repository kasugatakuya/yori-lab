/** DB の件数・期間・ファイルサイズを表示する: pnpm db:stats */
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { openSqliteRepositories } from "@/lib/db";
import { databaseFileSize } from "@/lib/db/sqlite/connection";
import { JOB_DAILY, JOB_FINS } from "@/lib/jquants/jobs";
import { loadDotenv } from "./lib/cli";

loadDotenv(path.resolve(process.cwd(), ".env"));
const config = loadConfig();
const repos = openSqliteRepositories(config.dbPath);
const size = databaseFileSize(config.dbPath);
console.log(`db: ${config.dbPath} (${size === null ? "n/a" : `${(size / 1024 / 1024).toFixed(2)} MB`})`);
console.log("daily_bars by source:");
for (const c of repos.dailyBars.coverageBySource()) {
  console.log(`  ${c.source.padEnd(8)} rows=${c.rows} codes=${c.codes} ${c.minDate ?? "-"}..${c.maxDate ?? "-"}`);
}
const cal = repos.calendar.coverage();
console.log(`calendar: rows=${cal.rows} ${cal.minDate ?? "-"}..${cal.maxDate ?? "-"}`);
console.log(`fin_summaries: rows=${repos.finSummaries.count()}`);
console.log(`progress daily: ${JSON.stringify(repos.fetchProgress.summary(JOB_DAILY))}`);
console.log(`progress fins:  ${JSON.stringify(repos.fetchProgress.summary(JOB_FINS))}`);
console.log(`meta: ${JSON.stringify(repos.meta.all())}`);
repos.close();
