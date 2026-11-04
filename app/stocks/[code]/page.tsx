import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CandlestickChart, type ChartBar } from "@/components/candlestick-chart";
import { Notice } from "@/components/notice";
import { Panel } from "@/components/panel";
import { PeriodFilter } from "@/components/period-filter";
import { ScatterChart } from "@/components/scatter-chart";
import { SourceBadge } from "@/components/source-badge";
import { ConditionalStatsTable } from "@/components/stats-table";
import { BoardTab } from "@/components/board-tab";
import { Tabs } from "@/components/tabs";
import { byGapBucket, byGapDirection, computeDailyMetrics } from "@/lib/analysis/daily";
import { isValidCode, normalizeCode } from "@/lib/codes";
import type { DailyBar } from "@/lib/db/types";
import { fmt2, fmtInt } from "@/lib/format";
import { applyPeriod, parsePeriod } from "@/lib/server/analysis";
import { loadBoardConditions, loadBoardDay } from "@/lib/server/board";
import { getUniverse, readData } from "@/lib/server/data";

export async function generateMetadata({ params }: PageProps<"/stocks/[code]">): Promise<Metadata> {
  const { code } = await params;
  return { title: `${normalizeCode(code)} 銘柄詳細` };
}

export default function StockPage({ params, searchParams }: PageProps<"/stocks/[code]">) {
  // params はリクエスト時の値なので、Suspense 境界の内側で読む（静的シェルから除外）
  return (
    <Suspense fallback={<Panel title="銘柄詳細">読み込み中…</Panel>}>
      <StockContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StockContent({ params, searchParams }: { params: PageProps<"/stocks/[code]">["params"]; searchParams: PageProps<"/stocks/[code]">["searchParams"] }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  if (!isValidCode(code)) notFound();
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const bdate = typeof sp.bdate === "string" ? sp.bdate : undefined;
  const stock = getUniverse().stocks.find((s) => s.code === code);
  const { bars, board, conditions } = await readData((repos) => {
    const board = loadBoardDay(repos, code, bdate);
    const cond = board ? loadBoardConditions(repos, code) : { days: [], table: [] };
    return { bars: repos.dailyBars.findMerged(code), board, conditions: { count: cond.days.length, table: cond.table } };
  });
  const metricsAll = computeDailyMetrics(bars);
  const metrics = applyPeriod(metricsAll, period);
  const chartBars: ChartBar[] = bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, source: b.source }));
  const sourceRanges = summarizeSources(bars);

  const dailyTab = (
    <div className="space-y-6">
      <Panel title="日足チャート（ローソク足と出来高）">
        <CandlestickChart bars={chartBars} />
        <SourceLine ranges={sourceRanges} />
      </Panel>
      <Panel title="寄り付き統計">
        <div className="mb-3">
          <Suspense>
            <PeriodFilter />
          </Suspense>
        </div>
        <div className="mb-3 text-xs text-muted tabular">
          分析期間: {metrics[0]?.date ?? "—"}〜{metrics[metrics.length - 1]?.date ?? "—"}（{fmtInt(metrics.length)}日）。出所:{" "}
          {[...new Set(metrics.map((m) => m.source))].map((s) => (
            <SourceBadge key={s} source={s} />
          ))}
        </div>
        {metrics.length === 0 ? (
          <Notice>統計を出せる日足がありません（前日終値が必要なため2日以上必要です）。</Notice>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold">ギャップ率 × 寄り→引け騰落率</h3>
              <ScatterChart
                points={metrics.map((m) => ({ x: m.gapRate, y: m.openToClose, label: m.date }))}
                xLabel="ギャップ率（始値 − 前日終値）"
                yLabel="寄り→引け騰落率"
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">ギャップ方向別</h3>
              <ConditionalStatsTable rows={byGapDirection(metrics)} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">ギャップ率の区分別</h3>
              <ConditionalStatsTable rows={byGapBucket(metrics)} />
            </div>
          </div>
        )}
      </Panel>
      <RecentBars bars={bars} />
    </div>
  );

  const boardTab = <BoardTab code={code} data={board} conditions={conditions} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">
          <span className="font-mono">{code}</span> {stock?.name ?? ""}
        </h1>
      </div>
      <Tabs
        initial={bdate ? 1 : 0}
        tabs={[
          { key: "daily", label: "日足分析", content: dailyTab },
          { key: "board", label: `板分析${board ? `（${board.dates.length}日）` : ""}`, content: boardTab },
        ]}
      />
    </div>
  );
}

function SourceLine({ ranges }: { ranges: ReturnType<typeof summarizeSources> }) {
  if (ranges.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span>出所:</span>
      {ranges.map((r) => (
        <span key={r.source} className="flex items-center gap-1 tabular">
          <SourceBadge source={r.source} /> {r.from}〜{r.to}（{r.count}本）
        </span>
      ))}
    </div>
  );
}

function summarizeSources(bars: { source: ChartBar["source"]; date: string }[]) {
  const m = new Map<ChartBar["source"], { source: ChartBar["source"]; from: string; to: string; count: number }>();
  for (const b of bars) {
    const cur = m.get(b.source);
    if (!cur) m.set(b.source, { source: b.source, from: b.date, to: b.date, count: 1 });
    else {
      cur.to = b.date;
      cur.count++;
    }
  }
  return [...m.values()];
}

function RecentBars({ bars }: { bars: DailyBar[] }) {
  const recent = bars.slice(-20).reverse();
  return (
    <Panel title={`日足（全${fmtInt(bars.length)}本、直近20本を表示）`}>
      {bars.length === 0 ? (
        <Notice>この銘柄の日足はまだありません。</Notice>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1">日付</th>
                <th className="py-1 text-right">始値</th>
                <th className="py-1 text-right">高値</th>
                <th className="py-1 text-right">安値</th>
                <th className="py-1 text-right">終値</th>
                <th className="py-1 text-right">出来高</th>
                <th className="py-1">出所</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((b) => {
                const cls = b.open !== null && b.close !== null ? (b.close > b.open ? "text-up" : b.close < b.open ? "text-down" : "") : "";
                return (
                  <tr key={`${b.date}-${b.source}`} className="border-t border-border">
                    <td className="py-1 tabular">{b.date}</td>
                    <td className="py-1 text-right tabular">{fmt2(b.open)}</td>
                    <td className="py-1 text-right tabular">{fmt2(b.high)}</td>
                    <td className="py-1 text-right tabular">{fmt2(b.low)}</td>
                    <td className={`py-1 text-right tabular ${cls}`}>{fmt2(b.close)}</td>
                    <td className="py-1 text-right tabular">{fmtInt(b.volume)}</td>
                    <td className="py-1">
                      <SourceBadge source={b.source} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
