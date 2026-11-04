import { nowIso } from "@/lib/dates";
import type { Repositories } from "@/lib/db";
import { databaseFileSize } from "@/lib/db/sqlite/connection";
import type { BoardDayInfo, BoardSnapshot, MinuteBar, Trade } from "@/lib/db/types";
import type { CollectorConfig } from "./config";
import { boardToDailyBar } from "./daily-bar";
import type { BoardProvider, NormalizedBoard } from "./provider";
import { MinuteAggregator, reconstructTrades, shouldSnapshot, toSnapshot } from "./recorder";
import { isWeekend, phaseAt, type Phase } from "./scheduler";
import { jstDate, jstSecondsOfDay, nowJstIso } from "./time";

export const META_COLLECTOR_ALERT = "collector.alert";
export const META_COLLECTOR_STATE = "collector.state";

export interface CollectorDeps {
  provider: BoardProvider;
  repos: Repositories;
  config: CollectorConfig;
  symbols: string[];
  log: (msg: string) => void;
  /** 現在時刻（テスト・シミュレーション用に差し替え可能） */
  clock?: () => Date;
  /** ループ間隔（実時間 ms） */
  tickMs?: number;
  /** 営業日判定（null なら土日以外を営業日とみなす） */
  isBusinessDay?: (ymd: string) => boolean;
  /** 当日だけ動かして終了するか（false なら翌日以降も待機し続ける） */
  once?: boolean;
}

interface SymbolState {
  last: NormalizedBoard | null;
  lastSavedAtMs: number | null;
  nextSeq: number;
  messages: number;
  /** 時価情報（board_day_info）に未保存の更新があるか */
  dirtyInfo: boolean;
}

/**
 * 収集プロセス本体。1秒ごとにフェーズを判定して、認証 → 接続・登録 → 記録 → 日足確定 を進める。
 * 受信した板は recorder の純粋関数で差分化し、まとめて SQLite に書く。
 */
export class Collector {
  private readonly clock: () => Date;
  private readonly tickMs: number;
  private phase: Phase = "idle";
  private tradeDate: string;
  private sessionId: number | null = null;
  private authenticatedOn: string | null = null;
  private registered: string[] = [];
  private dailyBarDone = false;
  private states = new Map<string, SymbolState>();
  private pendingSnapshots: BoardSnapshot[] = [];
  private pendingTrades: Trade[] = [];
  private agg = new MinuteAggregator("kabu");
  private lastMessageAtMs: number | null = null;
  private openGapId: number | null = null;
  private stopped = false;
  private unsubscribe: (() => void)[] = [];
  private lastFlushMs = 0;
  private lastStatsLogMs = 0;
  private counts = { snapshots: 0, trades: 0 };

  constructor(private readonly d: CollectorDeps) {
    this.clock = d.clock ?? (() => new Date());
    this.tickMs = d.tickMs ?? 1000;
    this.tradeDate = jstDate(this.clock());
  }

  private log(msg: string) {
    this.d.log(msg);
  }

  private setAlert(message: string | null) {
    if (message) {
      this.d.repos.meta.set(META_COLLECTOR_ALERT, JSON.stringify({ at: nowJstIso(this.clock()), message }));
      this.log(`ALERT: ${message}`);
    } else {
      this.d.repos.meta.set(META_COLLECTOR_ALERT, "");
    }
  }

  private setState(extra: Record<string, unknown> = {}) {
    this.d.repos.meta.set(
      META_COLLECTOR_STATE,
      JSON.stringify({
        phase: this.phase,
        tradeDate: this.tradeDate,
        provider: this.d.provider.name,
        connected: this.d.provider.isConnected(),
        registered: this.registered.length,
        lastMessageAt: this.lastMessageAtMs ? nowJstIso(new Date(this.lastMessageAtMs)) : null,
        updatedAt: nowJstIso(this.clock()),
        pid: process.pid,
        ...extra,
      }),
    );
  }

  async run(signal?: AbortSignal): Promise<void> {
    signal?.addEventListener("abort", () => {
      this.stopped = true;
    });
    this.unsubscribe.push(this.d.provider.onBoard((b) => this.onBoard(b)));
    this.unsubscribe.push(
      this.d.provider.onStatus((s) => {
        if (s.type === "connected") {
          this.log("provider: connected");
          this.setAlert(null);
        } else if (s.type === "disconnected") {
          this.log(`provider: disconnected (${s.reason})`);
          if (this.phase === "recording") this.openGap("disconnected");
        } else if (s.type === "reconnecting") {
          this.log(`provider: reconnecting attempt ${s.attempt} in ${s.delayMs}ms`);
        } else if (s.type === "error") {
          this.log(`provider: error ${s.message}`);
        }
      }),
    );
    this.log(`collector start: provider=${this.d.provider.name} symbols=${this.d.symbols.length} window=${fmt(this.d.config.startSec)}-${fmt(this.d.config.endSec)} dailyBarAt=${fmt(this.d.config.dailyBarAtSec)}`);
    try {
      while (!this.stopped) {
        await this.step();
        if (this.phase === "done" && this.d.once) break;
        await sleep(this.tickMs);
      }
    } finally {
      await this.shutdown();
    }
  }

  private async step(): Promise<void> {
    const now = this.clock();
    const today = jstDate(now);
    if (today !== this.tradeDate) {
      // 日付が変わった: 状態をリセット
      this.log(`date changed ${this.tradeDate} -> ${today}`);
      await this.endRecording("date changed");
      this.tradeDate = today;
      this.dailyBarDone = false;
      this.states.clear();
      this.agg = new MinuteAggregator("kabu");
      this.counts = { snapshots: 0, trades: 0 };
      this.phase = "idle";
    }
    const business = this.d.isBusinessDay ? this.d.isBusinessDay(today) : !isWeekend(today);
    if (!business) {
      if (this.phase !== "done") {
        this.log(`${today} is not a business day; waiting`);
        this.phase = "done";
        this.setState({ reason: "holiday" });
      }
      return;
    }
    const sec = jstSecondsOfDay(now);
    const next = phaseAt(sec, this.d.config, this.dailyBarDone);
    if (next !== this.phase) {
      this.log(`phase ${this.phase} -> ${next} (${fmt(sec)})`);
      await this.transition(this.phase, next);
      this.phase = next;
      this.setState();
    }
    if (this.phase === "recording") {
      this.checkIdle(now);
      await this.flushIfDue(now);
    }
  }

  private async transition(from: Phase, to: Phase): Promise<void> {
    if (to === "prepare" || (to === "recording" && from !== "prepare")) {
      await this.prepare();
    }
    if (to === "recording") {
      if (!this.d.provider.isConnected()) {
        this.setAlert(`${this.tradeDate} ${fmt(this.d.config.startSec)} までに API へ接続できていません（kabuステーションの起動・ログイン・APIパスワードを確認）`);
        await this.prepare();
      }
      this.sessionId = this.d.repos.collector.startSession(this.tradeDate, this.registered.length, `provider=${this.d.provider.name}`);
      this.lastMessageAtMs = null;
      this.log(`recording started: ${this.registered.length} symbols`);
    }
    if (from === "recording" && to !== "recording") {
      await this.endRecording("window end");
    }
    if (to === "daily-bar") {
      await this.finalizeDailyBars();
      this.dailyBarDone = true;
      this.phase = "done";
    }
  }

  /** 認証・接続・銘柄登録（冪等。毎朝1回） */
  private async prepare(): Promise<void> {
    try {
      if (this.authenticatedOn !== this.tradeDate) {
        await this.d.provider.authenticate();
        this.authenticatedOn = this.tradeDate;
        this.log("authenticated");
      }
      if (!this.d.provider.isConnected()) await this.d.provider.connect();
      if (this.registered.length === 0) {
        const wanted = this.d.symbols.slice(0, Math.min(this.d.config.maxSymbols, this.d.provider.maxSymbols));
        this.registered = await this.d.provider.registerSymbols(wanted);
        this.log(`registered ${this.registered.length}/${wanted.length} symbols: ${this.registered.join(",")}`);
        if (this.registered.length < wanted.length) this.log(`WARN: ${wanted.length - this.registered.length} symbols were not registered`);
      }
      this.setAlert(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setAlert(`準備に失敗: ${msg}`);
    }
  }

  private onBoard(b: NormalizedBoard): void {
    if (this.phase !== "recording") return;
    const nowMs = this.clock().getTime();
    this.lastMessageAtMs = nowMs;
    if (this.openGapId !== null) {
      this.d.repos.collector.closeGap(this.openGapId, nowJstIso(this.clock()));
      this.openGapId = null;
    }
    let st = this.states.get(b.code);
    if (!st) {
      st = { last: null, lastSavedAtMs: null, nextSeq: this.d.repos.trades.nextSeq(b.code, this.tradeDate), messages: 0, dirtyInfo: false };
      this.states.set(b.code, st);
    }
    st.messages++;
    const trades = reconstructTrades(st.last, b, this.tradeDate, st.nextSeq);
    for (const t of trades) {
      this.pendingTrades.push(t);
      this.agg.add(t);
      st.nextSeq++;
    }
    if (shouldSnapshot(st.last, b, { intervalMs: this.d.config.snapshotIntervalMs, depth: this.d.config.depth }, st.lastSavedAtMs, nowMs)) {
      this.pendingSnapshots.push(toSnapshot(b, this.tradeDate, this.d.config.depth));
      st.lastSavedAtMs = nowMs;
    }
    st.last = b;
    st.dirtyInfo = true;
  }

  private checkIdle(now: Date): void {
    if (this.lastMessageAtMs === null) return;
    const idleSec = (now.getTime() - this.lastMessageAtMs) / 1000;
    if (idleSec >= this.d.config.idleGapSec && this.openGapId === null) this.openGap(`idle ${Math.round(idleSec)}s`);
  }

  private openGap(reason: string): void {
    if (this.openGapId !== null) return;
    this.openGapId = this.d.repos.collector.openGap(this.tradeDate, nowJstIso(this.clock()), reason);
    this.log(`gap opened: ${reason}`);
  }

  private async flushIfDue(now: Date): Promise<void> {
    const ms = now.getTime();
    if (ms - this.lastFlushMs < this.d.config.flushIntervalMs) return;
    this.lastFlushMs = ms;
    this.flush();
    if (ms - this.lastStatsLogMs >= 60_000) {
      this.lastStatsLogMs = ms;
      this.logStats();
    }
  }

  private dayInfoRows(): BoardDayInfo[] {
    const out: BoardDayInfo[] = [];
    for (const [code, st] of this.states) {
      const b = st.last;
      if (!b || !st.dirtyInfo) continue;
      st.dirtyInfo = false;
      out.push({
        tradeDate: this.tradeDate,
        code,
        previousClose: b.previousClose,
        openingPrice: b.openingPrice,
        highPrice: b.highPrice,
        lowPrice: b.lowPrice,
        currentPrice: b.currentPrice,
        calcPrice: b.calcPrice,
        volume: b.tradingVolume,
        bestAsk: b.bestAsk.price,
        bestAskQty: b.bestAsk.qty,
        bestAskSign: b.bestAsk.sign,
        bestBid: b.bestBid.price,
        bestBidQty: b.bestBid.qty,
        bestBidSign: b.bestBid.sign,
        marketBuyQty: b.marketBuyQty,
        marketSellQty: b.marketSellQty,
        updatedAt: b.receivedAt,
      });
    }
    return out;
  }

  private flush(): void {
    const snaps = this.pendingSnapshots;
    const trades = this.pendingTrades;
    const bars: MinuteBar[] = this.agg.flush();
    const infos = this.dayInfoRows();
    this.pendingSnapshots = [];
    this.pendingTrades = [];
    if (snaps.length === 0 && trades.length === 0 && bars.length === 0 && infos.length === 0) {
      if (this.sessionId !== null && this.lastMessageAtMs !== null) this.d.repos.collector.touchSession(this.sessionId, nowJstIso(new Date(this.lastMessageAtMs)));
      return;
    }
    this.d.repos.transaction(() => {
      if (snaps.length) this.d.repos.boardSnapshots.insertMany(snaps);
      if (trades.length) this.d.repos.trades.insertMany(trades);
      if (bars.length) this.d.repos.minuteBars.upsertMany(bars);
      if (infos.length) this.d.repos.boardDayInfo.upsertMany(infos);
      if (this.sessionId !== null && this.lastMessageAtMs !== null) this.d.repos.collector.touchSession(this.sessionId, nowJstIso(new Date(this.lastMessageAtMs)), this.registered.length);
    });
    this.counts.snapshots += snaps.length;
    this.counts.trades += trades.length;
    this.setState({ snapshots: this.counts.snapshots, trades: this.counts.trades });
  }

  private logStats(final = false): void {
    if (final) this.d.repos.checkpoint();
    const bytes = databaseFileSize(this.d.config.dbPath);
    this.d.repos.collector.upsertDailyStats({
      tradeDate: this.tradeDate,
      snapshots: this.d.repos.boardSnapshots.countByDate(this.tradeDate),
      trades: this.d.repos.trades.countByDate(this.tradeDate),
      symbols: this.registered.length,
      dbBytes: bytes,
    });
    this.log(`stats: snapshots=${this.counts.snapshots} trades=${this.counts.trades} minuteBars=${this.agg.size} db=${bytes === null ? "n/a" : `${(bytes / 1024 / 1024).toFixed(1)}MB`}`);
  }

  private async endRecording(reason: string): Promise<void> {
    if (this.sessionId === null) return;
    this.flush();
    if (this.openGapId !== null) {
      this.d.repos.collector.closeGap(this.openGapId, nowJstIso(this.clock()));
      this.openGapId = null;
    }
    this.logStats(true);
    this.d.repos.collector.endSession(this.sessionId, nowJstIso(this.clock()), reason);
    this.log(`recording ended (${reason}): snapshots=${this.counts.snapshots} trades=${this.counts.trades}`);
    this.sessionId = null;
  }

  /** 大引け後に REST で板を取り、自前日足（出所 kabu）を保存する */
  private async finalizeDailyBars(): Promise<void> {
    const codes = this.registered.length ? this.registered : this.d.symbols;
    const fetchedAt = nowIso(this.clock());
    let saved = 0;
    for (const code of codes) {
      try {
        const b = await this.d.provider.fetchBoard(code);
        const bar = boardToDailyBar(b, this.tradeDate, fetchedAt);
        if (bar) {
          this.d.repos.dailyBars.upsertMany([bar]);
          saved++;
        } else {
          this.log(`daily bar skipped for ${code} (incomplete OHLC)`);
        }
      } catch (e) {
        this.log(`daily bar failed for ${code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.log(`daily bars saved: ${saved}/${codes.length} (source=kabu, date=${this.tradeDate})`);
    this.setState({ dailyBars: saved });
  }

  private async shutdown(): Promise<void> {
    await this.endRecording("shutdown");
    for (const u of this.unsubscribe) u();
    try {
      await this.d.provider.disconnect();
    } catch {
      /* ignore */
    }
    this.setState({ phase: "stopped" });
    this.log("collector stopped");
  }
}

function fmt(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
