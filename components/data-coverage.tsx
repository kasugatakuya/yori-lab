import { Notice } from "@/components/notice";
import { Panel } from "@/components/panel";
import { SourceBadge } from "@/components/source-badge";
import { fmtInt } from "@/lib/format";
import type { SourceCoverage } from "@/lib/db/types";

export function DataCoverage({
  coverage,
  calendar,
  window,
  mock,
}: {
  coverage: SourceCoverage[];
  calendar: { minDate: string | null; maxDate: string | null; rows: number };
  window: { from: string; to: string; plan: string; delayWeeks: number } | null;
  mock: boolean;
}) {
  const latest = coverage.reduce<string | null>((m, c) => (c.maxDate && (!m || c.maxDate > m) ? c.maxDate : m), null);
  return (
    <Panel title="データの範囲（出所別）">
      {mock ? (
        <div className="mb-3">
          <Notice kind="warn">このDBはモックデータです（pnpm seed:mock で生成）。実データではありません。</Notice>
        </div>
      ) : null}
      {coverage.length === 0 ? (
        <Notice>
          日足データがまだありません。<code className="font-mono">.env</code> に J-Quants のAPIキーを設定し、
          <code className="font-mono"> pnpm fetch:daily </code>を実行してください。
        </Notice>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1">出所</th>
              <th className="py-1">銘柄数</th>
              <th className="py-1">行数</th>
              <th className="py-1">開始日</th>
              <th className="py-1">終端日</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((c) => (
              <tr key={c.source} className="border-t border-border">
                <td className="py-1">
                  <SourceBadge source={c.source} />
                </td>
                <td className="py-1 tabular">{fmtInt(c.codes)}</td>
                <td className="py-1 tabular">{fmtInt(c.rows)}</td>
                <td className="py-1 tabular">{c.minDate ?? "—"}</td>
                <td className="py-1 tabular">{c.maxDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
        <div>
          <dt className="inline">日足の終端日: </dt>
          <dd className="inline tabular text-foreground">{latest ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline">取引カレンダー: </dt>
          <dd className="inline tabular text-foreground">
            {calendar.rows > 0 ? `${calendar.minDate}〜${calendar.maxDate}` : "未取得"}
          </dd>
        </div>
        {window ? (
          <div className="sm:col-span-2">
            <dt className="inline">J-Quants {window.plan} プランの取得可能期間: </dt>
            <dd className="inline tabular text-foreground">
              {window.from}〜{window.to}
              {window.delayWeeks > 0 ? `（${window.delayWeeks}週間遅延）` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-xs text-muted">
        J-Quants Freeプランは12週間遅延のため直近の日足は含まれません。直近分は kabuステーションから自前生成した日足（kabu）と、
        Yahoo Finance 非公式API（Yahoo）で補完します。同じ日に複数の出所がある場合は J-Quants &gt; kabu &gt; Yahoo の順で採用します。
      </p>
    </Panel>
  );
}
