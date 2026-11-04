/**
 * 古い日の板・約定・分足を Parquet に退避する。
 *   pnpm archive --list                       # 退避候補（記録がある日）を表示
 *   pnpm archive --before 2026-10-01          # それより前の日を data/archive/<date>/ に書き出す
 *   pnpm archive --before 2026-10-01 --purge  # 書き出した後に SQLite から削除して VACUUM
 * Parquet は DuckDB 等でそのまま読める。退避は同一 PC 内に限る（外部への持ち出しは利用規約に反する）。
 */
import path from "node:path";
import { archiveDate, purgeDate } from "@/lib/archive/archive";
import { loadConfig } from "@/lib/config";
import { openSqliteRepositories } from "@/lib/db";
import { createLogger, loadDotenv, parseArgs } from "./lib/cli";

async function main() {
  loadDotenv(path.resolve(process.cwd(), ".env"));
  const { flags } = parseArgs(process.argv.slice(2));
  const log = createLogger("archive");
  const repos = openSqliteRepositories(loadConfig().dbPath);
  const dates = repos.boardSnapshots.listDates().sort();
  if (flags.list === true || typeof flags.before !== "string") {
    console.log(`記録がある日: ${dates.length} 日`);
    for (const d of dates) console.log(`  ${d}: snapshots=${repos.boardSnapshots.countByDate(d)} trades=${repos.trades.countByDate(d)}`);
    repos.close();
    return;
  }
  const before = flags.before;
  const root = path.join(process.cwd(), "data", "archive");
  for (const d of dates.filter((x) => x < before)) {
    const r = await archiveDate(repos, d, root);
    log(`archived ${d}: snapshots=${r.snapshots} trades=${r.trades} minuteBars=${r.minuteBars} -> ${r.dir} (${(r.bytes / 1024 / 1024).toFixed(2)} MB)`);
    if (flags.purge === true) {
      const p = purgeDate(repos, d);
      log(`purged ${d}: snapshots=${p.snapshots} trades=${p.trades}`);
    }
  }
  if (flags.purge === true) {
    repos.checkpoint();
    log("vacuum...");
    repos.transaction(() => undefined);
  }
  repos.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
