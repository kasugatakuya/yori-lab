/**
 * 当日の購読銘柄（最大50）を前日までの日足から選び、data/subscriptions/<date>.json に書く。
 *   pnpm select:symbols            # 当日（JST）
 *   pnpm select:symbols --date 2026-11-05
 * ルールは data/selection.json で変更できる。collector は起動時にこのファイルを読む。
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { todayJst } from "@/lib/dates";
import { openSqliteRepositories } from "@/lib/db";
import { parseSelectionConfig, selectSymbols } from "@/lib/selection/select-symbols";
import { loadUniverse } from "@/lib/universe";
import { loadDotenv, parseArgs } from "./lib/cli";

loadDotenv(path.resolve(process.cwd(), ".env"));
const { flags } = parseArgs(process.argv.slice(2));
const date = typeof flags.date === "string" ? flags.date : todayJst();
const config = parseSelectionConfig(JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "selection.json"), "utf8")));
const repos = openSqliteRepositories(loadConfig().dbPath);
const universe = loadUniverse();
const candidates = universe.stocks.map((s) => ({ code: s.code, bars: repos.dailyBars.findMerged(s.code, { to: date }).filter((b) => b.date < date) }));
const { selected, scored } = selectSymbols(candidates, config, universe.stocks.map((s) => s.code));
const out = { date, generatedAt: new Date().toISOString(), config, codes: selected, scored: scored.slice(0, 100) };
const dir = path.join(process.cwd(), "data", "subscriptions");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${date}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`selected ${selected.length} symbols for ${date} -> ${file}`);
for (const s of scored.slice(0, selected.length)) console.log(`  ${s.code} score=${s.score.toFixed(2)} ${s.reason} last=${s.lastDate ?? "-"}`);
repos.close();
