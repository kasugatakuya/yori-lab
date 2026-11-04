import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { KabuPushClient, type PushEvent } from "./push-client";

let server: WebSocketServer | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

function listen(): Promise<{ port: number; wss: WebSocketServer }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    wss.on("listening", () => resolve({ port: (wss.address() as { port: number }).port, wss }));
    server = wss;
  });
}

describe("KabuPushClient", () => {
  it("接続・受信・切断後の自動再接続", async () => {
    const { port, wss } = await listen();
    let connections = 0;
    wss.on("connection", (ws) => {
      connections++;
      ws.send(JSON.stringify({ Symbol: "7203", CurrentPrice: 3000 + connections }));
      if (connections === 1) setTimeout(() => ws.close(), 30);
    });
    const client = new KabuPushClient({ url: `ws://127.0.0.1:${port}`, reconnectBaseMs: 20, reconnectMaxMs: 50 });
    const events: PushEvent[] = [];
    client.on((e) => events.push(e));
    client.connect();
    await new Promise((r) => setTimeout(r, 400));
    client.close();
    const messages = events.filter((e) => e.type === "message") as Extract<PushEvent, { type: "message" }>[];
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect((messages[0].data as { CurrentPrice: number }).CurrentPrice).toBe(3001);
    expect((messages[1].data as { CurrentPrice: number }).CurrentPrice).toBe(3002);
    expect(events.some((e) => e.type === "reconnecting")).toBe(true);
    expect(events.filter((e) => e.type === "open").length).toBeGreaterThanOrEqual(2);
  });

  it("不正な JSON は error イベント", async () => {
    const { port, wss } = await listen();
    wss.on("connection", (ws) => ws.send("not json"));
    const client = new KabuPushClient({ url: `ws://127.0.0.1:${port}` });
    const events: PushEvent[] = [];
    client.on((e) => events.push(e));
    client.connect();
    await new Promise((r) => setTimeout(r, 150));
    client.close();
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
