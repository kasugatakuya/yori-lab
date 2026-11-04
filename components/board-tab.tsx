import Link from "next/link";
import { BarLineChart } from "@/components/bar-line-chart";
import { BoardHeatmap } from "@/components/board-heatmap";
import { BoardReplay } from "@/components/board-replay";
import { CandlestickChart, type ChartBar } from "@/components/candlestick-chart";
import { LineChart } from "@/components/line-chart";
import { Notice } from "@/components/notice";
import { Panel } from "@/components/panel";
import type { BoardConditionStats } from "@/lib/analysis/board";
import type { MinuteBar } from "@/lib/db/types";
import { fmt2, fmtInt, fmtPct } from "@/lib/format";
import type { BoardDayData } from "@/lib/server/board";

/** lightweight-charts は時刻を UTC として描くので、JST 表示になるよう 9 時間ぶんずらした UNIX 秒を渡す */
function toChartBars(bars: MinuteBar[]): ChartBar[] {
  return bars.map((b) => ({ date: Math.floor(new Date(b.ts).getTime() / 1000) + 9 * 3600, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, source: b.source }));
}

export function BoardTab({ code, data, conditions }: { code: string; data: BoardDayData | null; conditions: { count: number; table: BoardConditionStats[] } }) {
  if (!data) {
    return (
      <Panel title="板分析">
        <Notice>
          この銘柄の板データはまだありません。板情報は無料の公開 API では取得できず過去分も提供されないため、collector で記録した日（記録開始日以降）のみが対象です。
        </Notice>
      </Panel>
    );
  }
  const pre = data.preOpen;
  const post = data.postOpen;
  const prePoints = pre.points.map((p) => ({ label: p.ts.slice(11, 16), value: p.indicative }));
  const preImb = pre.points.map((p) => ({ label: p.ts.slice(11, 16), value: p.imbalance }));
  const depthImb = data.depth.map((d) => ({ label: d.ts.slice(11, 16), value: d.imbalance }));
  const flowPoints = data.flow.map((f) => ({ label: f.ts.slice(11, 16), pos: f.buyQty, neg: f.sellQty }));
  const ofiPoints = data.flow.map((f) => ({ label: f.ts.slice(11, 16), value: f.ofi }));
  return (
    <div className="space-y-6">
      <Notice kind="warn">
        板は見せ板などにより実態と異なる場合があり、板の偏りが値動きを予測するとは限りません。約定は PUSH 配信（400ms 間引き）の出来高差分から復元しているため、複数の約定が1件にまとまることがあります。
      </Notice>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">記録日:</span>
        {data.dates.slice(0, 30).map((d) => (
          <Link key={d} href={`/stocks/${code}?bdate=${d}`} className={`rounded border px-2 py-0.5 ${d === data.tradeDate ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}>
            {d}
          </Link>
        ))}
        <span className="text-muted tabular">
          スナップショット {fmtInt(data.snapshotCount)} 件 / 約定 {fmtInt(data.tradeCount)} 件
        </span>
      </div>

      <Panel title="当日の分足">
        {data.minuteSource === null ? (
          <p className="text-sm text-muted">分足がありません（collector の約定から集計されます。Yahoo の5分足は手順5の fetch:yahoo で補完できます）。</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.minute1.length ? (
              <div>
                <h3 className="mb-1 text-xs font-semibold text-muted">1分足（{data.minuteSource}）</h3>
                <CandlestickChart bars={toChartBars(data.minute1)} height={260} intraday />
              </div>
            ) : null}
            {data.minute5.length ? (
              <div>
                <h3 className="mb-1 text-xs font-semibold text-muted">5分足（{data.minuteSource}）</h3>
                <CandlestickChart bars={toChartBars(data.minute5)} height={260} intraday />
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel title="寄り前（8:00〜寄り付き）: 気配の推移と寄り直前のバランス">
        <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Item label="寄り直前の気配" value={fmt2(pre.lastIndicative)} />
          <Item label="始値" value={fmt2(pre.openPrice)} />
          <Item label="気配→始値の乖離" value={fmtPct(pre.deviationFromOpen)} signed={pre.deviationFromOpen} />
          <Item label="寄り直前の板の偏り" value={pre.lastImbalance === null ? "—" : pre.lastImbalance.toFixed(2)} signed={pre.lastImbalance} />
          <Item label="成行バランス（買−売）/（買+売）" value={pre.lastMarketBalance === null ? "—" : pre.lastMarketBalance.toFixed(2)} signed={pre.lastMarketBalance} />
          <Item label="寄り前スナップショット" value={fmtInt(pre.points.length)} />
        </dl>
        <div className="grid gap-4 lg:grid-cols-2">
          <LineChart points={prePoints} title="寄前気配（中値）" />
          <BarLineChart points={preImb} title="板の偏り（上位5本、買−売）/（買+売）" format="fixed2" />
        </div>
      </Panel>

      <Panel title="寄り後（寄り付き〜）: 値動きと約定フロー">
        <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Item label="始値（時刻）" value={`${fmt2(post.openPrice)}${post.openTs ? `（${post.openTs.slice(11, 19)}）` : ""}`} />
          <Item label="1分後" value={fmtPct(post.move1m)} signed={post.move1m} />
          <Item label="5分後" value={fmtPct(post.move5m)} signed={post.move5m} />
          <Item label="15分後" value={fmtPct(post.move15m)} signed={post.move15m} />
          <Item label="30分後" value={fmtPct(post.move30m)} signed={post.move30m} />
          <Item label="寄り直後1分の OFI" value={post.ofi1m === null ? "—" : fmtInt(post.ofi1m)} signed={post.ofi1m} />
          <Item label="寄り直後5分の OFI" value={post.ofi5m === null ? "—" : fmtInt(post.ofi5m)} signed={post.ofi5m} />
          <Item label="寄り直後5分の買い圧力" value={post.pressure5m === null ? "—" : post.pressure5m.toFixed(2)} signed={post.pressure5m} />
        </dl>
        <div className="grid gap-4 lg:grid-cols-2">
          <BarLineChart points={flowPoints} title="1分ごとの約定数量（上: 買い、下: 売り。最良気配との比較で分類）" format="int" />
          <BarLineChart points={ofiPoints} title="1分ごとのオーダーフローインバランス（OFI）" format="int" />
        </div>
      </Panel>

      <Panel title="板ヒートマップ（時間 × 価格 × 数量）">
        <BoardHeatmap grid={data.heatmap} />
      </Panel>

      <Panel title="板リプレイ">
        <BoardReplay snapshots={data.replay} />
        {data.replay.length < data.snapshotCount ? <p className="mt-2 text-xs text-muted">表示は {fmtInt(data.replay.length)} 件に間引いています（全 {fmtInt(data.snapshotCount)} 件）。</p> : null}
      </Panel>

      <Panel title="板の変化: 偏りの推移、大口注文、薄い価格帯">
        <BarLineChart points={depthImb} title="板の偏り（上位5本）の推移" format="fixed2" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted">大口注文の出現・消失（中央値の5倍以上、直近30件）</h3>
            {data.largeOrders.length === 0 ? (
              <p className="text-sm text-muted">検出なし</p>
            ) : (
              <table className="w-full text-xs tabular [&_td]:px-1 [&_th]:px-1">
                <thead className="text-left text-muted">
                  <tr>
                    <th>時刻</th>
                    <th>側</th>
                    <th className="text-right">価格</th>
                    <th className="text-right">数量</th>
                    <th>種別</th>
                    <th className="text-right">倍率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.largeOrders.map((e, i) => (
                    <tr key={i} className="border-t border-border">
                      <td>{e.ts.slice(11, 19)}</td>
                      <td>{e.side === "ask" ? "売り" : "買い"}</td>
                      <td className="text-right">{fmt2(e.price)}</td>
                      <td className="text-right">{fmtInt(e.qty)}</td>
                      <td>{e.kind === "appeared" ? "出現" : "消失"}</td>
                      <td className="text-right">{e.ratio.toFixed(1)}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted">最終スナップショットの薄い価格帯（中央値の20%未満）</h3>
            {data.thin.length === 0 ? (
              <p className="text-sm text-muted">なし</p>
            ) : (
              <ul className="text-xs tabular">
                {data.thin.map((t, i) => (
                  <li key={i}>
                    {t.side === "ask" ? "売り" : "買い"} {fmt2(t.price)}: {fmtInt(t.qty)}（中央値の {(t.ratio * 100).toFixed(0)}%）
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>

      <Panel title={`条件別集計（記録済み ${fmtInt(conditions.count)} 日）`}>
        <ConditionTable rows={conditions.table} />
      </Panel>
    </div>
  );
}

export function ConditionTable({ rows }: { rows: BoardConditionStats[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm [&_td]:px-2 [&_th]:px-2">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1">条件</th>
            <th className="py-1 text-right">日数</th>
            <th className="py-1 text-right">5分後 平均</th>
            <th className="py-1 text-right">5分後 上昇率</th>
            <th className="py-1 text-right">15分後 平均</th>
            <th className="py-1 text-right">15分後 上昇率</th>
            <th className="py-1 text-right">引け 平均</th>
            <th className="py-1 text-right">引け 上昇率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border">
              <td className="py-1">
                {r.label}
                {r.count > 0 && !r.reliable ? <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-300">参考（サンプル不足）</span> : null}
              </td>
              <td className="py-1 text-right tabular">{fmtInt(r.count)}</td>
              <td className="py-1 text-right"><Signed v={r.avgMove5m} /></td>
              <td className="py-1 text-right tabular">{fmtPct(r.upRate5m)}</td>
              <td className="py-1 text-right"><Signed v={r.avgMove15m} /></td>
              <td className="py-1 text-right tabular">{fmtPct(r.upRate15m)}</td>
              <td className="py-1 text-right"><Signed v={r.avgMoveClose} /></td>
              <td className="py-1 text-right tabular">{fmtPct(r.upRateClose)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">サンプルが20日未満の行は「参考」です。板の偏りや OFI と、その後の値動きの関係は統計的に弱いことが多く、見せ板の影響も受けます。</p>
    </div>
  );
}

function Signed({ v }: { v: number | null }) {
  const cls = v === null ? "" : v > 0 ? "text-up" : v < 0 ? "text-down" : "";
  return <span className={`tabular ${cls}`}>{fmtPct(v)}</span>;
}

function Item({ label, value, signed }: { label: string; value: string; signed?: number | null }) {
  const cls = signed === undefined || signed === null ? "" : signed > 0 ? "text-up" : signed < 0 ? "text-down" : "";
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular ${cls}`}>{value}</dd>
    </div>
  );
}
