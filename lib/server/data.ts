import "server-only";
import { io } from "next/cache";
import { loadConfig } from "@/lib/config";
import { openSqliteRepositories, type Repositories } from "@/lib/db";
import { loadUniverse, type Universe } from "@/lib/universe";

/**
 * Next.js（サーバーコンポーネント / Route Handler）から SQLite を読むための入口。
 *
 * - better-sqlite3 は同期ドライバなので、Cache Components の静的シェル生成から除外するため
 *   読み取りの前に `await io()` を呼ぶ（公式ガイドに従う）
 * - 接続は**リクエストごとに開いて閉じる**。長寿命の接続を持つと、取得スクリプトや collector
 *   （別プロセス）が WAL ファイルを作り直したときに古い WAL を参照し続け、新しい書き込みが
 *   見えなくなることがある（開発サーバーで実際に発生した）。SQLite のオープンは数ミリ秒なので
 *   毎回開く方が安全。
 */
export async function readData<T>(fn: (repos: Repositories) => T): Promise<T> {
  await io();
  const repos = openSqliteRepositories(loadConfig().dbPath);
  try {
    return fn(repos);
  } finally {
    repos.close();
  }
}

export function getUniverse(): Universe {
  // universe.json は手動編集されるので毎回読む（小さいファイル）
  return loadUniverse();
}
