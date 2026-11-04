import path from "node:path";
import { parseHms } from "./time";

export interface CollectorConfig {
  providerName: "kabu" | "mock";
  dbPath: string;
  kabu: { baseUrl: string; wsUrl: string; apiPassword: string };
  /** 認証（トークン再発行）を開始する時刻（秒）。既定 06:30 */
  authAfterSec: number;
  /** 記録開始・終了（秒） */
  startSec: number;
  endSec: number;
  /** 自前日足を REST で確定させる時刻（秒）。既定 15:40 */
  dailyBarAtSec: number;
  /** 接続・登録を記録開始の何秒前に行うか */
  prepareLeadSec: number;
  depth: number;
  snapshotIntervalMs: number;
  /** 受信が途切れたと判断する秒数 */
  idleGapSec: number;
  /** 購読銘柄（空なら subscriptions ファイル → universe 先頭から） */
  symbols: string[];
  maxSymbols: number;
  flushIntervalMs: number;
}

export function loadCollectorConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): CollectorConfig {
  const dbPath = env.YORI_DB_PATH && env.YORI_DB_PATH.length > 0 ? env.YORI_DB_PATH : "./data/db/yori-lab.sqlite";
  const n = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    providerName: env.COLLECTOR_PROVIDER === "mock" ? "mock" : "kabu",
    dbPath: path.isAbsolute(dbPath) ? dbPath : path.resolve(cwd, dbPath),
    kabu: {
      baseUrl: env.KABU_API_BASE_URL ?? "http://localhost:18080/kabusapi",
      wsUrl: env.KABU_WS_URL ?? "ws://localhost:18080/kabusapi/websocket",
      apiPassword: env.KABU_API_PASSWORD ?? "",
    },
    authAfterSec: parseHms(env.COLLECTOR_AUTH_AFTER ?? "06:30"),
    startSec: parseHms(env.COLLECTOR_START ?? "08:00"),
    endSec: parseHms(env.COLLECTOR_END ?? "09:30"),
    dailyBarAtSec: parseHms(env.COLLECTOR_DAILY_BAR_AT ?? "15:40"),
    prepareLeadSec: n(env.COLLECTOR_PREPARE_LEAD_SEC, 120),
    depth: Math.min(10, Math.max(1, n(env.COLLECTOR_BOARD_DEPTH, 10))),
    snapshotIntervalMs: n(env.COLLECTOR_SNAPSHOT_INTERVAL_MS, 1000),
    idleGapSec: n(env.COLLECTOR_IDLE_GAP_SEC, 15),
    symbols: (env.COLLECTOR_SYMBOLS ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    maxSymbols: n(env.COLLECTOR_MAX_SYMBOLS, 50),
    flushIntervalMs: n(env.COLLECTOR_FLUSH_INTERVAL_MS, 1000),
  };
}
