import type { ConditionalStats } from "@/lib/analysis/daily";
import { MIN_RELIABLE_SAMPLES } from "@/lib/analysis/daily";
import { fmtInt, fmtPct } from "@/lib/format";

function Pct({ v }: { v: number | null | undefined }) {
  const cls = v === null || v === undefined ? "" : v > 0 ? "text-up" : v < 0 ? "text-down" : "";
  return <span className={`tabular ${cls}`}>{fmtPct(v)}</span>;
}

export function ConditionalStatsTable({ rows, showGap = true }: { rows: ConditionalStats[]; showGap?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm [&_td]:px-2 [&_th]:px-2">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1">条件</th>
            <th className="py-1 text-right">日数</th>
            <th className="py-1 text-right">勝率</th>
            <th className="py-1 text-right">平均 寄→引</th>
            <th className="py-1 text-right">中央値</th>
            <th className="py-1 text-right">累積</th>
            <th className="py-1 text-right">最大DD</th>
            {showGap ? <th className="py-1 text-right">平均ギャップ</th> : null}
            <th className="py-1 text-right">平均 寄→高</th>
            <th className="py-1 text-right">平均 寄→安</th>
            <th className="py-1 text-right">継続率</th>
            <th className="py-1 text-right">反転率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border">
              <td className="py-1">
                {r.label}
                {r.count > 0 && r.count < MIN_RELIABLE_SAMPLES ? (
                  <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-300" title={`サンプルが${MIN_RELIABLE_SAMPLES}日未満のため参考値です`}>
                    参考
                  </span>
                ) : null}
              </td>
              <td className="py-1 text-right tabular">{fmtInt(r.count)}</td>
              <td className="py-1 text-right tabular">{fmtPct(r.winRate)}</td>
              <td className="py-1 text-right"><Pct v={r.avgReturn} /></td>
              <td className="py-1 text-right"><Pct v={r.medianReturn} /></td>
              <td className="py-1 text-right"><Pct v={r.count ? r.totalReturn : null} /></td>
              <td className="py-1 text-right tabular">{r.count ? fmtPct(r.maxDrawdown) : "—"}</td>
              {showGap ? <td className="py-1 text-right"><Pct v={r.avgGapRate} /></td> : null}
              <td className="py-1 text-right tabular">{fmtPct(r.avgOpenToHigh)}</td>
              <td className="py-1 text-right tabular">{fmtPct(r.avgOpenToLow)}</td>
              <td className="py-1 text-right tabular">{fmtPct(r.continuationRate)}</td>
              <td className="py-1 text-right tabular">{fmtPct(r.reversalRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        勝率は寄り買い・引け売りで騰落率が正だった日の割合。累積は毎日1単位ずつ売買した場合の損益率の合計。継続率・反転率はギャップ方向と寄り→引けの方向の一致／不一致の割合（ギャップ0の日は除く）。
        「参考」はサンプルが{MIN_RELIABLE_SAMPLES}日未満の統計です。
      </p>
    </div>
  );
}
