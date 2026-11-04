import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Panel } from "@/components/panel";
import { fmt2, fmtInt, fmtPct } from "@/lib/format";
import { getUniverse, readData } from "@/lib/server/data";

export const metadata: Metadata = { title: "寄り前スクリーニング" };

const SIGN: Record<string, string> = { "0101": "一般", "0102": "特別", "0103": "注意", "0107": "寄前", "0116": "寄前(成立無)", "0117": "寄前(成立有)", "0118": "連続約定", "0120": "買上/売下" };

export default function MorningPage({ searchParams }: PageProps<"/morning">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">寄り前スクリーニング</h1>
        <p className="text-sm text-muted">collector が購読中の銘柄について、最新の気配・板の偏り・ギャップ見込みを一覧します。ページを再読み込みすると更新されます。</p>
      </div>
      <Notice kind="warn">
        kabuステーションAPIの銘柄登録上限は50銘柄（REST/PUSH 合算）のため、対象200銘柄を同時には監視できません。ここに出るのは当日購読した銘柄だけです。板は見せ板などで実態と異なる場合があり、気配の偏りが寄り後の値動きを予測するとは限りません。
      </Notice>
      <Suspense fallback={<Panel title="気配一覧">読み込み中…</Panel>}>
        <MorningTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MorningTable({ searchParams }: { searchParams: PageProps<"/morning">["searchParams"] }) {
  const sp = await searchParams;
  const wanted = typeof sp.date === "string" ? sp.date : undefined;
  const universe = getUniverse();
  const names = new Map(universe.stocks.map((s) => [s.code, s.name]));
  const data = await readData((repos) => {
    const date = wanted ?? repos.boardDayInfo.latestDate();
    if (!date) return null;
    const infos = repos.boardDayInfo.findByDate(date);
    // 直近の板スナップショットから上位5本の偏りを出す
    const rows = infos.map((i) => {
      const snaps = repos.boardSnapshots.find(i.code, date);
      const last = snaps[snaps.length - 1];
      const ask5 = last ? last.asks.slice(0, 5).reduce((s, [, q]) => s + q, 0) : null;
      const bid5 = last ? last.bids.slice(0, 5).reduce((s, [, q]) => s + q, 0) : null;
      const imbalance = ask5 !== null && bid5 !== null && ask5 + bid5 > 0 ? (bid5 - ask5) / (bid5 + ask5) : null;
      const indicative = i.currentPrice ?? i.calcPrice ?? (i.bestAsk !== null && i.bestBid !== null ? (i.bestAsk + i.bestBid) / 2 : (i.bestAsk ?? i.bestBid));
      const prevClose = i.previousClose ?? repos.dailyBars.findMerged(i.code, { to: date }).filter((b) => b.date < date).at(-1)?.close ?? null;
      const gap = indicative !== null && prevClose ? (indicative - prevClose) / prevClose : null;
      const mb = i.marketBuyQty;
      const ms = i.marketSellQty;
      const marketBalance = mb !== null && ms !== null && mb + ms > 0 ? (mb - ms) / (mb + ms) : null;
      return { ...i, ask5, bid5, imbalance, indicative, prevClose, gap, marketBalance, snapshots: snaps.length };
    });
    return { date, rows };
  });
  if (!data) {
    return (
      <Panel title="気配一覧">
        <Notice>板データがありません。collector を起動して記録を始めてください（`pnpm collector`）。</Notice>
      </Panel>
    );
  }
  const rows = [...data.rows].sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));
  return (
    <Panel title={`気配一覧（${data.date}、${fmtInt(rows.length)}銘柄、ギャップ見込みの絶対値順）`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm [&_td]:px-2 [&_th]:px-2">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1">コード</th>
              <th className="py-1">銘柄名</th>
              <th className="py-1 text-right">前日終値</th>
              <th className="py-1 text-right">気配 / 現在値</th>
              <th className="py-1 text-right">ギャップ見込み</th>
              <th className="py-1 text-right">売気配(5本)</th>
              <th className="py-1 text-right">買気配(5本)</th>
              <th className="py-1 text-right">板の偏り</th>
              <th className="py-1 text-right">成行バランス</th>
              <th className="py-1">気配種別</th>
              <th className="py-1 text-right">始値</th>
              <th className="py-1 text-right">出来高</th>
              <th className="py-1">更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-border">
                <td className="py-1 font-mono">
                  <Link href={`/stocks/${r.code}?bdate=${data.date}`} className="text-accent hover:underline">
                    {r.code}
                  </Link>
                </td>
                <td className="py-1">{names.get(r.code) ?? ""}</td>
                <td className="py-1 text-right tabular">{fmt2(r.prevClose)}</td>
                <td className="py-1 text-right tabular">{fmt2(r.indicative)}</td>
                <td className={`py-1 text-right tabular ${r.gap === null ? "" : r.gap > 0 ? "text-up" : r.gap < 0 ? "text-down" : ""}`}>{fmtPct(r.gap)}</td>
                <td className="py-1 text-right tabular">{fmtInt(r.ask5)}</td>
                <td className="py-1 text-right tabular">{fmtInt(r.bid5)}</td>
                <td className={`py-1 text-right tabular ${r.imbalance === null ? "" : r.imbalance > 0.2 ? "text-up" : r.imbalance < -0.2 ? "text-down" : ""}`}>{r.imbalance === null ? "—" : r.imbalance.toFixed(2)}</td>
                <td className="py-1 text-right tabular">{r.marketBalance === null ? "—" : r.marketBalance.toFixed(2)}</td>
                <td className="py-1 text-xs">{SIGN[r.bestAskSign ?? ""] ?? r.bestAskSign ?? "—"}</td>
                <td className="py-1 text-right tabular">{fmt2(r.openingPrice)}</td>
                <td className="py-1 text-right tabular">{fmtInt(r.volume)}</td>
                <td className="py-1 tabular text-xs">{r.updatedAt.slice(11, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        ギャップ見込み = （寄前気配または現在値 − 前日終値）/ 前日終値。板の偏り = （買い数量 − 売り数量）/（買い数量 + 売り数量）（上位5本）。成行バランスは寄り前の成行注文の買い・売り数量から。
      </p>
    </Panel>
  );
}
