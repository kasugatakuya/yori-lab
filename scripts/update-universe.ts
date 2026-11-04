/**
 * 時価総額上位 N 銘柄で data/universe.json を更新する。
 *   pnpm update:universe                # J-Quants valuation API（取得可能な最新日）で上位200
 *   pnpm update:universe --top 200 --date 2026-08-06
 *   pnpm update:universe --dry-run      # 書き込まず表示のみ
 *
 * 方式の選定（手順5で再確認）:
 *   - J-Quants 日足の MktCap は削除予定のため使わない
 *   - J-Quants バリュエーション指標 API の MktCap（百万円、自己株式控除後）を採用。date 指定で全銘柄を2リクエスト
 *     （valuation + master）で取得でき、Free プランでも利用できる（12週間遅延）
 *   - kabuステーションの /symbol（TotalMarketValue）は 200 回のリクエストが必要で kabuステーション起動中に限られるため、
 *     こちらは採用しない（必要なら後から追加できる）
 *   - 内国株券（ProdCat=011）以外（ETF・REIT・外国株）は除外。既存の銘柄名・手動項目は保持する
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeCode } from "@/lib/codes";
import { loadConfig } from "@/lib/config";
import { todayJst } from "@/lib/dates";
import { openSqliteRepositories } from "@/lib/db";
import { JQuantsClient } from "@/lib/jquants/client";
import { toNum } from "@/lib/jquants/convert";
import { getAvailableWindow } from "@/lib/jquants/plan";
import { loadUniverse } from "@/lib/universe";
import { createLogger, loadDotenv, parseArgs } from "./lib/cli";

async function main() {
  loadDotenv(path.resolve(process.cwd(), ".env"));
  const { flags } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  if (!config.jquants.apiKey) {
    console.error("JQUANTS_API_KEY が設定されていません");
    process.exit(2);
  }
  const log = createLogger("update-universe");
  const top = typeof flags.top === "string" ? Number(flags.top) : 200;
  const repos = openSqliteRepositories(config.dbPath);
  const window = getAvailableWindow(config.jquants.plan, todayJst());
  // 取得可能な最新の営業日（カレンダーが無ければ window.to）
  const days = repos.calendar.businessDays({ from: window.from, to: window.to });
  const date = typeof flags.date === "string" ? flags.date : (days[days.length - 1] ?? window.to);
  const client = new JQuantsClient({ apiKey: config.jquants.apiKey, baseUrl: config.jquants.baseUrl, ratePerMinute: config.jquants.ratePerMinute, logger: (m) => log(`[client] ${m}`) });

  log(`fetching valuation for ${date}`);
  const valuation = await client.getValuation({ date });
  log(`valuation rows: ${valuation.length}; fetching master`);
  const master = await client.getMaster({ date });
  const info = new Map(master.map((m) => [normalizeCode(m.Code), m]));
  const ranked = valuation
    .map((v) => ({ code: normalizeCode(v.Code), mktCap: toNum(v.MktCap) }))
    .filter((v) => v.mktCap !== null && info.get(v.code)?.ProdCat === "011")
    .sort((a, b) => b.mktCap! - a.mktCap!)
    .slice(0, top);
  const existing = new Map(loadUniverse().stocks.map((s) => [s.code, s]));
  const stocks = ranked.map((r) => ({
    code: r.code,
    name: existing.get(r.code)?.name ?? info.get(r.code)?.CoName ?? r.code,
    marketCap: Math.round(r.mktCap!),
  }));
  const out = { $comment: `時価総額上位${top}銘柄。J-Quants valuation API（${date}時点、百万円、自己株式控除後）で自動更新。`, updatedAt: todayJst(), basisDate: date, stocks };
  log(`top ${stocks.length}: ${stocks.slice(0, 10).map((s) => `${s.code} ${s.name} ${s.marketCap}`).join(" / ")} ...`);
  if (flags["dry-run"] === true) {
    console.log(JSON.stringify(out, null, 2).slice(0, 2000));
  } else {
    const file = path.join(process.cwd(), "data", "universe.json");
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    log(`written ${file} (${stocks.length} stocks)`);
  }
  repos.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
