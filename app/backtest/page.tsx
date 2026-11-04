import type { Metadata } from "next";
import { Suspense } from "react";
import { BacktestForm } from "@/components/backtest-form";
import { EquityChart } from "@/components/equity-chart";
import { Notice } from "@/components/notice";
import { Panel } from "@/components/panel";
import { runBacktest, type BacktestParams, type DailyMetric } from "@/lib/analysis/daily";
import { normalizeCode } from "@/lib/codes";
import { fmt2, fmtInt, fmtPct } from "@/lib/format";
import { applyPeriod, metricsForCodes, parsePeriod } from "@/lib/server/analysis";
import { getUniverse, readData } from "@/lib/server/data";

export const metadata: Metadata = { title: "簡易バックテスト" };

export default function BacktestPage({ searchParams }: PageProps<"/backtest">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">簡易バックテスト</h1>
        <p className="text-sm text-muted">
          条件に合う日に寄り付きで仕掛け、引け（または損切り・利確）で手仕舞う単純な検証です。手数料・スリッページは考慮しません。
        </p>
      </div>
      <Notice kind="warn">
        日足では高値と安値のどちらが先に付いたか分かりません。損切りと利確の両方に到達した日は「判定不能」として損益から除外し、件数を表示します。分足データが溜まれば分足での検証に切り替えられます。
      </Notice>
      <Panel title="条件">
        <Suspense>
          <BacktestForm />
        </Suspense>
      </Panel>
      <Suspense fallback={<Panel title="結果">計算中…</Panel>}>
        <Result searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function pct(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n / 100 : null;
}

async function Result({ searchParams }: { searchParams: PageProps<"/backtest">["searchParams"] }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]);
  const period = parsePeriod(sp);
  const params: BacktestParams = {
    side: one("side") === "short" ? "short" : "long",
    gapMin: pct(one("gapMin")),
    gapMax: pct(one("gapMax")),
    minVolumeRatio: one("minVolumeRatio") ? Number(one("minVolumeRatio")) : null,
    stopLossPct: pct(one("stopLoss")),
    takeProfitPct: pct(one("takeProfit")),
  };
  const universe = getUniverse();
  const wanted = (one("codes") ?? "")
    .split(/[,\s]+/)
    .map((c) => normalizeCode(c))
    .filter((c) => c.length > 0);
  const codes = wanted.length ? universe.stocks.map((s) => s.code).filter((c) => wanted.includes(c)) : universe.stocks.map((s) => s.code);

  const result = await readData((repos) => {
    const all = metricsForCodes(repos, codes);
    const filtered = new Map<string, DailyMetric[]>();
    for (const [code, ms] of all) filtered.set(code, applyPeriod(ms, period));
    return runBacktest(filtered, params);
  });
  const s = result.summary;
  const names = new Map(universe.stocks.map((st) => [st.code, st.name]));
  const recent = [...result.trades].reverse().slice(0, 50);

  return (
    <div className="space-y-4">
      <Panel title="成績サマリー">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label="トレード数" value={fmtInt(s.trades)} />
          <Stat label="判定可能 / 判定不能" value={`${fmtInt(s.determined)} / ${fmtInt(s.undetermined)}`} />
          <Stat label="勝率" value={fmtPct(s.winRate)} />
          <Stat label="平均損益率" value={fmtPct(s.avgReturn)} signed={s.avgReturn} />
          <Stat label="累積損益率" value={fmtPct(s.determined ? s.totalReturn : null)} signed={s.determined ? s.totalReturn : null} />
          <Stat label="最大ドローダウン" value={s.determined ? fmtPct(s.maxDrawdown) : "—"} />
          <Stat label="プロフィットファクター" value={s.profitFactor === null ? "—" : s.profitFactor === Infinity ? "∞" : fmt2(s.profitFactor)} />
          <Stat label="対象銘柄数" value={fmtInt(codes.length)} />
        </dl>
        {s.undetermined > 0 ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">判定不能が {fmtInt(s.undetermined)} 件あります（損切りと利確の両方に到達）。これらは損益に含めていません。</p>
        ) : null}
      </Panel>
      <Panel title="累積損益率の推移（1トレード1単位、日別合算）">
        <EquityChart points={result.equity} />
      </Panel>
      <Panel title={`トレード一覧（直近${fmtInt(recent.length)}件 / 全${fmtInt(result.trades.length)}件）`}>
        {recent.length === 0 ? (
          <Notice>条件に合うトレードがありません。</Notice>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1">日付</th>
                  <th className="py-1">銘柄</th>
                  <th className="py-1 text-right">ギャップ率</th>
                  <th className="py-1 text-right">建値</th>
                  <th className="py-1 text-right">手仕舞い</th>
                  <th className="py-1">理由</th>
                  <th className="py-1 text-right">損益率</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={`${t.code}-${t.date}`} className="border-t border-border">
                    <td className="py-1 tabular">{t.date}</td>
                    <td className="py-1">
                      <span className="font-mono">{t.code}</span> {names.get(t.code) ?? ""}
                    </td>
                    <td className="py-1 text-right tabular">{fmtPct(t.gapRate)}</td>
                    <td className="py-1 text-right tabular">{fmt2(t.entry)}</td>
                    <td className="py-1 text-right tabular">{fmt2(t.exit)}</td>
                    <td className="py-1">{{ close: "引け", stop: "損切り", take: "利確", undetermined: "判定不能" }[t.exitReason]}</td>
                    <td className={`py-1 text-right tabular ${t.ret === null ? "" : t.ret > 0 ? "text-up" : t.ret < 0 ? "text-down" : ""}`}>{fmtPct(t.ret)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, signed }: { label: string; value: string; signed?: number | null }) {
  const cls = signed === undefined || signed === null ? "" : signed > 0 ? "text-up" : signed < 0 ? "text-down" : "";
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular text-lg ${cls}`}>{value}</dd>
    </div>
  );
}
