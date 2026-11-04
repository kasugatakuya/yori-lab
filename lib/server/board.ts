import "server-only";
import {
  boardConditionTable,
  depthSeries,
  flowBuckets,
  largeOrderEvents,
  postOpenSummary,
  preOpenSummary,
  thinLevels,
  type BoardConditionStats,
  type BoardDaySummary,
  type DepthSummary,
  type FlowBucket,
  type LargeOrderEvent,
  type PostOpenSummary,
  type PreOpenSummary,
  type ThinLevel,
} from "@/lib/analysis/board";
import type { Repositories } from "@/lib/db";
import type { BoardSnapshot, MinuteBar, Trade } from "@/lib/db/types";

/** 板ヒートマップ用のグリッド（時間バケット × 価格） */
export interface HeatmapGrid {
  /** バケット開始時刻（ISO） */
  times: string[];
  /** 価格（昇順） */
  prices: number[];
  /** [timeIndex, priceIndex, askQty, bidQty] */
  cells: [number, number, number, number][];
  bucketSec: number;
  /** 各バケットの現在値（null は無し） */
  lastPrice: (number | null)[];
}

export function buildHeatmap(snapshots: readonly BoardSnapshot[], bucketSec = 10, maxPrices = 60): HeatmapGrid {
  if (snapshots.length === 0) return { times: [], prices: [], cells: [], bucketSec, lastPrice: [] };
  const t0 = new Date(snapshots[0].ts).getTime();
  const buckets = new Map<number, { asks: Map<number, number>; bids: Map<number, number>; n: number; last: number | null }>();
  const priceCount = new Map<number, number>();
  for (const s of snapshots) {
    const bi = Math.floor((new Date(s.ts).getTime() - t0) / (bucketSec * 1000));
    let b = buckets.get(bi);
    if (!b) {
      b = { asks: new Map(), bids: new Map(), n: 0, last: null };
      buckets.set(bi, b);
    }
    b.n++;
    if (s.currentPrice !== null) b.last = s.currentPrice;
    for (const [p, q] of s.asks) {
      b.asks.set(p, (b.asks.get(p) ?? 0) + q);
      priceCount.set(p, (priceCount.get(p) ?? 0) + 1);
    }
    for (const [p, q] of s.bids) {
      b.bids.set(p, (b.bids.get(p) ?? 0) + q);
      priceCount.set(p, (priceCount.get(p) ?? 0) + 1);
    }
  }
  // 出現回数の多い価格を最大 maxPrices 本に絞る（寄り前の遠い気配で縦軸が伸びすぎるのを防ぐ）
  const prices = [...priceCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPrices)
    .map(([p]) => p)
    .sort((a, b) => a - b);
  const pIdx = new Map(prices.map((p, i) => [p, i]));
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const times = keys.map((k) => new Date(t0 + k * bucketSec * 1000 + 9 * 3600_000).toISOString().slice(0, 19) + "+09:00");
  const cells: [number, number, number, number][] = [];
  const lastPrice: (number | null)[] = [];
  keys.forEach((k, ti) => {
    const b = buckets.get(k)!;
    lastPrice.push(b.last);
    const all = new Set([...b.asks.keys(), ...b.bids.keys()]);
    for (const p of all) {
      const pi = pIdx.get(p);
      if (pi === undefined) continue;
      cells.push([ti, pi, (b.asks.get(p) ?? 0) / b.n, (b.bids.get(p) ?? 0) / b.n]);
    }
  });
  return { times, prices, cells, bucketSec, lastPrice };
}

/** 等間隔に間引く（最大 max 件） */
export function downsample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * step)]);
  if (out[out.length - 1] !== items[items.length - 1]) out.push(items[items.length - 1]);
  return out;
}

export interface BoardDayData {
  code: string;
  tradeDate: string;
  dates: string[];
  snapshotCount: number;
  tradeCount: number;
  replay: BoardSnapshot[];
  heatmap: HeatmapGrid;
  depth: DepthSummary[];
  flow: FlowBucket[];
  preOpen: PreOpenSummary;
  postOpen: PostOpenSummary;
  largeOrders: LargeOrderEvent[];
  thin: ThinLevel[];
  minute1: MinuteBar[];
  minute5: MinuteBar[];
  minuteSource: MinuteBar["source"] | null;
  trades: Trade[];
}

export function loadBoardDay(repos: Repositories, code: string, date?: string): BoardDayData | null {
  const dates = repos.boardSnapshots.listDates(code);
  const tradeDate = date && dates.includes(date) ? date : dates[0];
  if (!tradeDate) return null;
  const snapshots = repos.boardSnapshots.find(code, tradeDate);
  const trades = repos.trades.find(code, tradeDate);
  let minute1 = repos.minuteBars.find(code, tradeDate, 1, "kabu");
  let minute5 = repos.minuteBars.find(code, tradeDate, 5, "kabu");
  let minuteSource: MinuteBar["source"] | null = minute1.length || minute5.length ? "kabu" : null;
  if (!minuteSource) {
    minute1 = [];
    minute5 = repos.minuteBars.find(code, tradeDate, 5, "yahoo");
    minuteSource = minute5.length ? "yahoo" : null;
  }
  const last = snapshots[snapshots.length - 1];
  return {
    code,
    tradeDate,
    dates,
    snapshotCount: snapshots.length,
    tradeCount: trades.length,
    replay: downsample(snapshots, 1500),
    heatmap: buildHeatmap(snapshots),
    depth: downsample(depthSeries(snapshots, 5), 600),
    flow: flowBuckets(trades, snapshots, 1),
    preOpen: preOpenSummary(snapshots, trades, 5),
    postOpen: postOpenSummary(snapshots, trades),
    largeOrders: largeOrderEvents(snapshots, 5).slice(-30),
    thin: last ? thinLevels(last, 0.2) : [],
    minute1,
    minute5,
    minuteSource,
    trades: downsample(trades, 300),
  };
}

/** 記録済みの全日について寄り前・寄り後の要約を作り、条件別集計する */
export function loadBoardConditions(repos: Repositories, code: string): { days: BoardDaySummary[]; table: BoardConditionStats[] } {
  const days: BoardDaySummary[] = [];
  for (const d of repos.boardSnapshots.listDates(code)) {
    const snapshots = repos.boardSnapshots.find(code, d);
    const trades = repos.trades.find(code, d);
    const pre = preOpenSummary(snapshots, trades, 5);
    const post = postOpenSummary(snapshots, trades);
    const bar = repos.dailyBars.findMerged(code, { from: d, to: d })[0];
    const moveToClose = post.openPrice !== null && bar?.close != null ? (bar.close - post.openPrice) / post.openPrice : null;
    days.push({ code, tradeDate: d, preOpen: pre, postOpen: post, moveToClose });
  }
  return { days, table: boardConditionTable(days) };
}
