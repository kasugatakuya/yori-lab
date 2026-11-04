import fs from "node:fs";
import path from "node:path";

/** `--key value` / `--flag` / `--key=value` を簡易パース */
export function parseArgs(argv: string[]): { flags: Record<string, string | true>; positional: string[] } {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    if (eq >= 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positional };
}

/** .env をプロセス環境に読み込む（既存の環境変数は上書きしない）。依存を増やさないための最小実装 */
export function loadDotenv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

/** 標準出力とログファイル（logs/<name>.log）の両方に書く */
export function createLogger(name: string, logDir = path.resolve(process.cwd(), "logs")) {
  fs.mkdirSync(logDir, { recursive: true });
  const file = path.join(logDir, `${name}.log`);
  return (msg: string) => {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    fs.appendFileSync(file, line + "\n");
  };
}

/** Ctrl+C / SIGTERM で AbortSignal を発火（2回目は即終了） */
export function abortOnSignal(): AbortSignal {
  const ac = new AbortController();
  let count = 0;
  const handler = () => {
    count++;
    if (count >= 2) process.exit(130);
    console.log("\n中断要求を受け付けました。現在の日付の処理が終わり次第停止します（もう一度押すと即終了）");
    ac.abort();
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return ac.signal;
}
