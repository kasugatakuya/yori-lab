import { Suspense } from "react";
import { DataCoverage } from "@/components/data-coverage";
import { Notice } from "@/components/notice";
import { Panel } from "@/components/panel";
import { PeriodFilter } from "@/components/period-filter";
import { RankingTable } from "@/components/ranking-table";
import { summarizeStock, type StockSummary } from "@/lib/analysis/daily";
import { loadConfig } from "@/lib/config";
import { todayJst } from "@/lib/dates";
import { getAvailableWindow } from "@/lib/jquants/plan";
import { applyPeriod, metricsForCodes, parsePeriod } from "@/lib/server/analysis";
import { getUniverse, readData } from "@/lib/server/data";

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-muted">対象銘柄の寄り付き統計ランキング。既定の期間は「取得できる全期間」です。列見出しで並べ替えできます。</p>
      </div>
      <Suspense fallback={<Panel title="銘柄ランキング">読み込み中…</Panel>}>
        <RankingSection searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Panel title="データの範囲（出所別）">読み込み中…</Panel>}>
        <CoverageSection />
      </Suspense>
    </div>
  );
}

async function RankingSection({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const period = parsePeriod(await searchParams);
  const universe = getUniverse();
  const codes = universe.stocks.map((s) => s.code);
  const rows: StockSummary[] = await readData((repos) => {
    const metrics = metricsForCodes(repos, codes);
    return universe.stocks.map((s) => summarizeStock(s.code, s.name, applyPeriod(metrics.get(s.code) ?? [], period)));
  });
  const lastDate = rows.reduce<string | null>((m, r) => (r.lastDate && (!m || r.lastDate > m) ? r.lastDate : m), null);
  const firstDate = rows.reduce<string | null>((m, r) => (r.firstDate && (!m || r.firstDate < m) ? r.firstDate : m), null);
  return (
    <Panel title="銘柄ランキング（寄り買い・引け売り）">
      <div className="mb-3">
        <Suspense>
          <PeriodFilter />
        </Suspense>
      </div>
      <div className="mb-2 text-xs text-muted tabular">
        分析期間: {firstDate ?? "—"}〜{lastDate ?? "—"}
        {period.days ? `（直近${period.days}営業日）` : "（全期間）"}。出所は銘柄詳細で確認できます。
      </div>
      {rows.every((r) => r.count === 0) ? <Notice>分析できる日足がありません。pnpm fetch:daily で取得してください。</Notice> : <RankingTable rows={rows} />}
    </Panel>
  );
}

async function CoverageSection() {
  const data = await readData((repos) => ({
    coverage: repos.dailyBars.coverageBySource(),
    calendar: repos.calendar.coverage(),
    mock: repos.meta.get("mock") === "true",
  }));
  const window = getAvailableWindow(loadConfig().jquants.plan, todayJst());
  return <DataCoverage coverage={data.coverage} calendar={data.calendar} window={window} mock={data.mock} />;
}
