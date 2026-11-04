/**
 * レートリミッタ（既定: 5件/分）。
 *
 * J-Quants 公式仕様（/ja/spec/rate-limits）:
 * - 1分間のスライディングウィンドウで判定し、429 になったリクエストもカウントされる
 * - Retry-After ヘッダーは付与されない。429 時は 1〜2 分待ってから再開することを推奨
 * - 大幅に超過すると 5 分程度アクセスが遮断される
 *
 * サーバー側はレスポンス完了時刻で数えている様子（実測: 12.4秒間隔でも6件目が429）のため、
 * ウィンドウ内の件数制限に加えて送信間隔を「windowMs / maxRequests + marginMs」に広げる（spread）。
 * Free(5/分) なら 12秒 + 3秒 = 15秒間隔（4件/分）。
 * now / sleep は注入可能にしてテストで時間を進められるようにする。
 */
export interface RateLimiterOptions {
  maxRequests: number;
  windowMs?: number;
  /** サーバー側の計測との時計ずれ・応答時間を吸収する余裕（ms）。既定 3000 */
  marginMs?: number;
  /** true なら送信間隔を windowMs / maxRequests に均等化する（既定 true） */
  spread?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly marginMs: number;
  private readonly minGapMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly sent: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(opts: RateLimiterOptions) {
    if (!(opts.maxRequests > 0)) throw new Error("maxRequests must be > 0");
    this.max = opts.maxRequests;
    this.windowMs = opts.windowMs ?? 60_000;
    this.marginMs = opts.marginMs ?? 3_000;
    this.minGapMs = (opts.spread ?? true) ? Math.ceil(this.windowMs / this.max) + this.marginMs : 0;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** 送信枠を1つ確保する（呼び出し順に直列化） */
  acquire(): Promise<void> {
    const run = async () => {
      for (;;) {
        const t = this.now();
        while (this.sent.length > 0 && t - this.sent[0] >= this.windowMs) this.sent.shift();
        const last = this.sent.length > 0 ? this.sent[this.sent.length - 1] : null;
        if (last !== null && t - last < this.minGapMs) {
          await this.sleep(this.minGapMs - (t - last));
          continue;
        }
        if (this.sent.length < this.max) {
          this.sent.push(t);
          return;
        }
        const wait = this.windowMs - (t - this.sent[0]) + this.marginMs;
        await this.sleep(Math.max(wait, 1));
      }
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** 429 を受けたとき: ウィンドウを使い切った扱いにして次回の送信を遅らせる */
  penalize(): void {
    const t = this.now();
    while (this.sent.length < this.max) this.sent.push(t);
  }

  /** 直近ウィンドウ内の送信数 */
  get inFlight(): number {
    const t = this.now();
    return this.sent.filter((s) => t - s < this.windowMs).length;
  }
}
