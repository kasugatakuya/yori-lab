import fs from "node:fs";
import path from "node:path";
import { isValidCode, normalizeCode } from "./codes";

export interface UniverseStock {
  code: string;
  name: string;
  /** 時価総額（百万円）。任意 */
  marketCap: number | null;
}

export interface Universe {
  updatedAt: string | null;
  stocks: UniverseStock[];
}

export function parseUniverse(json: unknown): Universe {
  if (!json || typeof json !== "object") throw new Error("universe.json: object expected");
  const obj = json as { updatedAt?: unknown; stocks?: unknown };
  if (!Array.isArray(obj.stocks)) throw new Error("universe.json: stocks[] expected");
  const seen = new Set<string>();
  const stocks: UniverseStock[] = [];
  for (const raw of obj.stocks as unknown[]) {
    const r = raw as { code?: unknown; name?: unknown; marketCap?: unknown };
    if (typeof r.code !== "string") throw new Error("universe.json: code must be string");
    const code = normalizeCode(r.code);
    if (!isValidCode(code)) throw new Error(`universe.json: invalid code ${r.code}`);
    if (seen.has(code)) continue;
    seen.add(code);
    stocks.push({
      code,
      name: typeof r.name === "string" ? r.name : code,
      marketCap: typeof r.marketCap === "number" ? r.marketCap : null,
    });
  }
  return { updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : null, stocks };
}

export function loadUniverse(file?: string): Universe {
  // Turbopack のトレース対象を data/ 配下に限定するため、既定パスは path.join で静的に組み立てる
  const resolved = file ?? path.join(process.cwd(), "data", "universe.json");
  const text = fs.readFileSync(/*turbopackIgnore: true*/ resolved, "utf8");
  return parseUniverse(JSON.parse(text));
}
