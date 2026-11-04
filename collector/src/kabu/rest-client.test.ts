import { describe, expect, it } from "vitest";
import { KabuApiError, KabuRestClient } from "./rest-client";

function mock(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}

describe("KabuRestClient", () => {
  it("トークン発行→X-API-KEY 付与→銘柄登録→板取得", async () => {
    const m = mock((url, init) => {
      if (url.endsWith("/token")) return { status: 200, body: { ResultCode: 0, Token: "tok" } };
      if (url.endsWith("/register")) {
        const body = JSON.parse(String(init?.body)) as { Symbols: { Symbol: string; Exchange: number }[] };
        return { status: 200, body: { RegistList: body.Symbols } };
      }
      if (url.includes("/board/")) return { status: 200, body: { Symbol: "7203", CurrentPrice: 3000 } };
      return { status: 404, body: { Code: 4001, Message: "not found" } };
    });
    const c = new KabuRestClient({ baseUrl: "http://localhost:18080/kabusapi", apiPassword: "pw", fetch: m.fetchImpl });
    await expect(c.board("7203")).rejects.toBeInstanceOf(KabuApiError); // 未認証
    await c.authenticate();
    expect(JSON.parse(String(m.calls[0].init?.body))).toEqual({ APIPassword: "pw" });
    const reg = await c.register(["7203", "8306"]);
    expect(reg).toEqual(["7203", "8306"]);
    expect((m.calls[1].init?.headers as Record<string, string>)["X-API-KEY"]).toBe("tok");
    const b = await c.board("7203");
    expect(b.CurrentPrice).toBe(3000);
    expect(m.calls[2].url).toBe("http://localhost:18080/kabusapi/board/7203%401");
  });

  it("エラーは KabuApiError（Code / Message 付き）", async () => {
    const m = mock(() => ({ status: 401, body: { Code: 4001007, Message: "Unauthorized" } }));
    const c = new KabuRestClient({ baseUrl: "http://x", apiPassword: "pw", fetch: m.fetchImpl });
    await expect(c.authenticate()).rejects.toMatchObject({ status: 401, code: 4001007 });
  });
});
