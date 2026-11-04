/**
 * 板・約定の収集プロセス。
 *
 *   pnpm collector                 # kabuステーションAPI（collector/.env を使用）
 *   pnpm collector:mock            # モックで動作確認（kabuステーション不要）
 *   pnpm collector:mock --simulate # 8:00〜9:30 を 30 倍速で再現して容量を見積もる
 *
 * 毎朝 6:30 以降にトークンを再発行し、8:00（COLLECTOR_START）の2分前に接続・銘柄登録、
 * 8:00〜9:30 の板・約定を記録、15:40 に REST で板を取って自前日足を保存する。
 * 8:00 までに接続できなければ meta.collector.alert に警告を書き、/collector 画面に表示される。
 */
import fs from "node:fs";
import path from "node:path";
import { openSqliteRepositories } from "@/lib/db";
import { loadUniverse } from "@/lib/universe";
import { abortOnSignal, createLogger, loadDotenv, parseArgs } from "../../scripts/lib/cli";
import { Collector } from "./collector";
import { loadCollectorConfig } from "./config";
import { KabuStationProvider } from "./kabu/provider";
import { MockBoardProvider } from "./mock/provider";
import type { BoardProvider } from "./provider";
import { jstDate, jstDateTime, parseHms } from "./time";

async function main() {
  const root = path.resolve(process.cwd());
  loadDotenv(path.join(root, "collector", ".env"));
  const { flags } = parseArgs(process.argv.slice(2));
  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (flags.mock === true) env.COLLECTOR_PROVIDER = "mock";
  const simulate = flags.simulate === true;
  if (simulate) {
    // シミュレーション: 日足確定を記録終了の直後にして、1日分を短時間で流す
    env.COLLECTOR_DAILY_BAR_AT = env.COLLECTOR_DAILY_BAR_AT_SIM ?? "09:31";
    env.COLLECTOR_PREPARE_LEAD_SEC = "60";
  }
  const config = loadCollectorConfig(env, root);
  const log = createLogger("collector", path.join(root, "logs"));
  const repos = openSqliteRepositories(config.dbPath);

  // 購読銘柄: COLLECTOR_SYMBOLS → data/subscriptions/<date>.json → universe の先頭から
  const today = jstDate();
  let symbols = config.symbols;
  const subFile = path.join(root, "data", "subscriptions", `${today}.json`);
  if (symbols.length === 0 && fs.existsSync(subFile)) {
    const j = JSON.parse(fs.readFileSync(subFile, "utf8")) as { codes?: string[] };
    symbols = j.codes ?? [];
    log(`symbols from ${subFile}: ${symbols.length}`);
  }
  if (symbols.length === 0) {
    const n = typeof flags.symbols === "string" ? Number(flags.symbols) : 10;
    symbols = loadUniverse().stocks.slice(0, n).map((s) => s.code);
    log(`symbols from universe (first ${n}): ${symbols.join(",")}`);
  }

  let provider: BoardProvider;
  let clock: (() => Date) | undefined;
  let tickMs = 1000;
  if (config.providerName === "mock") {
    const speed = typeof flags.speed === "string" ? Number(flags.speed) : simulate ? 30 : 1;
    if (speed !== 1) {
      // 疑似時計: 記録開始の 90 秒前（シミュレーション時間）から speed 倍で進む
      const startReal = Date.now();
      const simStart = jstDateTime(today, config.startSec - config.prepareLeadSec - 30).getTime();
      clock = () => new Date(simStart + (Date.now() - startReal) * speed);
      tickMs = Math.max(20, Math.round(1000 / speed));
      log(`simulation: speed=${speed}x starting at ${new Date(simStart).toISOString()}`);
    }
    provider = new MockBoardProvider({ tickMs: Math.max(20, Math.round(400 / (clock ? (typeof flags.speed === "string" ? Number(flags.speed) : 30) : 1))), clock, openAt: "09:00" });
  } else {
    if (!config.kabu.apiPassword) {
      console.error("KABU_API_PASSWORD が設定されていません（collector/.env を参照）");
      process.exit(2);
    }
    provider = new KabuStationProvider({ baseUrl: config.kabu.baseUrl, wsUrl: config.kabu.wsUrl, apiPassword: config.kabu.apiPassword, depth: config.depth, logger: log });
  }

  const collector = new Collector({
    provider,
    repos,
    config,
    symbols,
    log,
    clock,
    tickMs,
    once: simulate || flags.once === true,
    isBusinessDay: (ymd) => {
      const days = repos.calendar.find({ from: ymd, to: ymd });
      if (days.length === 0) return !["0", "6"].includes(String(new Date(`${ymd}T00:00:00Z`).getUTCDay()));
      return days[0].holDiv === "1" || days[0].holDiv === "2";
    },
  });
  await collector.run(abortOnSignal());
  repos.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// 参考: parseHms は設定値の検証に使う
void parseHms;
