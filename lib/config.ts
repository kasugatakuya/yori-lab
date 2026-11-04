import path from "node:path";

export type JQuantsPlan = "free" | "light" | "standard" | "premium";

const PLAN_DEFAULT_RATE: Record<JQuantsPlan, number> = {
  free: 5,
  light: 60,
  standard: 120,
  premium: 500,
};

function parsePlan(v: string | undefined): JQuantsPlan {
  const s = (v ?? "free").toLowerCase();
  if (s === "light" || s === "standard" || s === "premium") return s;
  return "free";
}

export interface AppConfig {
  dbPath: string;
  jquants: {
    apiKey: string | null;
    plan: JQuantsPlan;
    ratePerMinute: number;
    /** /v2/fins/summary 専用枠（プラン共通で 60/分） */
    finsRatePerMinute: number;
    baseUrl: string;
  };
}

/** 環境変数から設定を読む（サーバー側・スクリプト側のみで使う） */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): AppConfig {
  const plan = parsePlan(env.JQUANTS_PLAN);
  const rate = Number(env.JQUANTS_RATE_LIMIT_PER_MIN);
  const finsRate = Number(env.JQUANTS_FINS_RATE_LIMIT_PER_MIN);
  const dbPath = env.YORI_DB_PATH && env.YORI_DB_PATH.length > 0 ? env.YORI_DB_PATH : "./data/db/yori-lab.sqlite";
  return {
    dbPath: path.isAbsolute(dbPath) ? dbPath : path.resolve(cwd, dbPath),
    jquants: {
      apiKey: env.JQUANTS_API_KEY && env.JQUANTS_API_KEY.trim().length > 0 ? env.JQUANTS_API_KEY.trim() : null,
      plan,
      ratePerMinute: Number.isFinite(rate) && rate > 0 ? rate : PLAN_DEFAULT_RATE[plan],
      finsRatePerMinute: Number.isFinite(finsRate) && finsRate > 0 ? finsRate : 60,
      baseUrl: env.JQUANTS_BASE_URL ?? "https://api.jquants.com",
    },
  };
}
