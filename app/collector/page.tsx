import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Panel } from "@/components/panel";
import { fmtInt } from "@/lib/format";
import { JOB_DAILY, JOB_FINS } from "@/lib/jquants/jobs";
import { readData } from "@/lib/server/data";

export const metadata: Metadata = { title: "収集状況" };

const META_COLLECTOR_ALERT = "collector.alert";
const META_COLLECTOR_STATE = "collector.state";

export default function CollectorPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">収集状況</h1>
        <p className="text-sm text-muted">板・約定の収集プロセス（collector）と J-Quants 取得ジョブの状態。</p>
      </div>
      <Suspense fallback={<Panel title="collector">読み込み中…</Panel>}>
        <CollectorStatus />
      </Suspense>
      <Suspense fallback={<Panel title="J-Quants 取得ジョブ">読み込み中…</Panel>}>
        <JobStatus />
      </Suspense>
    </div>
  );
}

interface CollectorState {
  phase?: string;
  tradeDate?: string;
  provider?: string;
  connected?: boolean;
  registered?: number;
  lastMessageAt?: string | null;
  updatedAt?: string;
  snapshots?: number;
  trades?: number;
  dailyBars?: number;
  reason?: string;
}

function parseJson<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function mb(bytes: number | null): string {
  return bytes === null ? "—" : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function CollectorStatus() {
  const data = await readData((repos) => ({
    alert: parseJson<{ at: string; message: string }>(repos.meta.get(META_COLLECTOR_ALERT)),
    state: parseJson<CollectorState>(repos.meta.get(META_COLLECTOR_STATE)),
    sessions: repos.collector.listSessions(10),
    gaps: repos.collector.listGaps(undefined, 30),
    stats: repos.collector.listDailyStats(30),
  }));
  const s = data.state;
  const phaseLabel: Record<string, string> = {
    idle: "待機中",
    prepare: "準備中（認証・接続・銘柄登録）",
    recording: "記録中",
    "wait-close": "大引け待ち",
    "daily-bar": "日足確定中",
    done: "本日分完了",
    stopped: "停止",
  };
  // 日別容量: 前日との差分で1日あたりの増分を見積もる
  const statsAsc = [...data.stats].sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : 1));
  const deltas = new Map<string, number | null>();
  for (let i = 0; i < statsAsc.length; i++) {
    const cur = statsAsc[i];
    const prev = statsAsc[i - 1];
    deltas.set(cur.tradeDate, cur.dbBytes !== null && prev?.dbBytes != null ? cur.dbBytes - prev.dbBytes : null);
  }
  return (
    <div className="space-y-4">
      {data.alert?.message ? (
        <Notice kind="warn">
          <strong>警告</strong>（{data.alert.at}）: {data.alert.message}
        </Notice>
      ) : null}
      <Panel title="collector の状態">
        {!s ? (
          <Notice>collector はまだ起動していません。kabuステーションを動かしている PC で <code className="font-mono">pnpm collector</code> を実行してください。</Notice>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Item label="フェーズ" value={phaseLabel[s.phase ?? ""] ?? s.phase ?? "—"} />
            <Item label="対象日" value={s.tradeDate ?? "—"} />
            <Item label="プロバイダ" value={s.provider ?? "—"} />
            <Item label="接続" value={s.connected ? "接続中" : "未接続"} warn={s.phase === "recording" && !s.connected} />
            <Item label="購読銘柄数" value={fmtInt(s.registered ?? 0)} />
            <Item label="最終受信時刻" value={s.lastMessageAt ?? "—"} />
            <Item label="本日のスナップショット / 約定" value={`${fmtInt(s.snapshots ?? 0)} / ${fmtInt(s.trades ?? 0)}`} />
            <Item label="状態更新時刻" value={s.updatedAt ?? "—"} />
          </dl>
        )}
      </Panel>
      <Panel title="日別データ量">
        {data.stats.length === 0 ? (
          <p className="text-sm text-muted">記録がありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1">日付</th>
                  <th className="py-1 text-right">銘柄数</th>
                  <th className="py-1 text-right">スナップショット</th>
                  <th className="py-1 text-right">約定</th>
                  <th className="py-1 text-right">DB サイズ</th>
                  <th className="py-1 text-right">前日比（増分）</th>
                  <th className="py-1">更新</th>
                </tr>
              </thead>
              <tbody>
                {data.stats.map((st) => (
                  <tr key={st.tradeDate} className="border-t border-border">
                    <td className="py-1 tabular">{st.tradeDate}</td>
                    <td className="py-1 text-right tabular">{fmtInt(st.symbols)}</td>
                    <td className="py-1 text-right tabular">{fmtInt(st.snapshots)}</td>
                    <td className="py-1 text-right tabular">{fmtInt(st.trades)}</td>
                    <td className="py-1 text-right tabular">{mb(st.dbBytes)}</td>
                    <td className="py-1 text-right tabular">{mb(deltas.get(st.tradeDate) ?? null)}</td>
                    <td className="py-1 tabular text-xs">{st.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="セッションと欠損区間">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted">セッション（直近10件）</h3>
            {data.sessions.length === 0 ? (
              <p className="text-sm text-muted">なし</p>
            ) : (
              <table className="w-full text-xs [&_td]:px-1 [&_th]:px-1">
                <thead className="text-left text-muted">
                  <tr>
                    <th>日付</th>
                    <th>開始</th>
                    <th>終了</th>
                    <th className="text-right">銘柄</th>
                    <th>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((se) => (
                    <tr key={se.id} className="border-t border-border tabular">
                      <td>{se.tradeDate}</td>
                      <td>{se.startedAt.slice(11, 19)}</td>
                      <td>{se.endedAt ? se.endedAt.slice(11, 19) : "—"}</td>
                      <td className="text-right">{se.symbolCount}</td>
                      <td>{se.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted">欠損区間（直近30件）</h3>
            {data.gaps.length === 0 ? (
              <p className="text-sm text-muted">なし</p>
            ) : (
              <table className="w-full text-xs [&_td]:px-1 [&_th]:px-1">
                <thead className="text-left text-muted">
                  <tr>
                    <th>日付</th>
                    <th>開始</th>
                    <th>終了</th>
                    <th>理由</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gaps.map((g) => (
                    <tr key={g.id} className="border-t border-border tabular">
                      <td>{g.tradeDate}</td>
                      <td>{g.startedAt.slice(11, 19)}</td>
                      <td>{g.endedAt ? g.endedAt.slice(11, 19) : "継続中"}</td>
                      <td>{g.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Item({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular ${warn ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</dd>
    </div>
  );
}

async function JobStatus() {
  const { daily, fins, meta } = await readData((repos) => ({
    daily: repos.fetchProgress.summary(JOB_DAILY),
    fins: repos.fetchProgress.summary(JOB_FINS),
    meta: repos.meta.all(),
  }));
  const shown = Object.fromEntries(Object.entries(meta).filter(([k]) => k.startsWith("jquants.")));
  return (
    <Panel title="J-Quants 取得ジョブ">
      <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1">ジョブ</th>
            <th className="py-1 text-right">完了</th>
            <th className="py-1 text-right">エラー</th>
            <th className="py-1">最終更新</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["日足（pnpm fetch:daily）", daily],
              ["財務サマリー（pnpm fetch:fins）", fins],
            ] as const
          ).map(([label, sum]) => (
            <tr key={label} className="border-t border-border">
              <td className="py-1">{label}</td>
              <td className="py-1 text-right tabular">{sum.done}</td>
              <td className="py-1 text-right tabular">{sum.error}</td>
              <td className="py-1 tabular text-xs">{sum.lastUpdatedAt ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <pre className="mt-3 overflow-x-auto rounded bg-background p-2 text-xs">{JSON.stringify(shown, null, 2)}</pre>
    </Panel>
  );
}
