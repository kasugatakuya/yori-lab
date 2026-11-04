import WebSocket from "ws";

export interface PushClientOptions {
  url: string;
  /** 再接続の初期待機（ms）と上限 */
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  logger?: (msg: string) => void;
}

export type PushEvent =
  | { type: "open" }
  | { type: "message"; data: unknown; receivedAt: number }
  | { type: "close"; code: number; reason: string }
  | { type: "error"; message: string }
  | { type: "reconnecting"; attempt: number; delayMs: number };

/**
 * kabuステーション PUSH（WebSocket）クライアント。
 * 切断されたら指数バックオフで自動再接続する（公式仕様に再接続の規定はないため、こちらで実装）。
 */
export class KabuPushClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<(e: PushEvent) => void>();
  private wantOpen = false;
  private attempt = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: PushClientOptions) {
    this.log = opts.logger ?? (() => undefined);
  }

  on(handler: (e: PushEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(e: PushEvent) {
    for (const h of this.handlers) h(e);
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.wantOpen = true;
    this.open();
  }

  private open(): void {
    if (!this.wantOpen) return;
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;
    ws.on("open", () => {
      this.attempt = 0;
      this.log(`push: connected ${this.opts.url}`);
      this.emit({ type: "open" });
    });
    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        this.emit({ type: "error", message: "invalid JSON from push" });
        return;
      }
      this.emit({ type: "message", data: parsed, receivedAt: Date.now() });
    });
    ws.on("error", (err) => {
      this.emit({ type: "error", message: err.message });
    });
    ws.on("close", (code, reason) => {
      this.emit({ type: "close", code, reason: reason.toString() });
      this.ws = null;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.wantOpen) return;
    this.attempt++;
    const base = this.opts.reconnectBaseMs ?? 1000;
    const max = this.opts.reconnectMaxMs ?? 30_000;
    const delay = Math.min(max, base * 2 ** Math.min(this.attempt - 1, 10));
    this.emit({ type: "reconnecting", attempt: this.attempt, delayMs: delay });
    this.log(`push: reconnecting in ${delay}ms (attempt ${this.attempt})`);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }

  close(): void {
    this.wantOpen = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.removeAllListeners("close");
      ws.on("close", () => this.emit({ type: "close", code: 1000, reason: "client close" }));
      ws.close();
    }
  }
}
