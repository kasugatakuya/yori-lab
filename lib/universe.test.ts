import { describe, expect, it } from "vitest";
import { loadUniverse, parseUniverse } from "./universe";

describe("universe", () => {
  it("正規化と重複排除", () => {
    const u = parseUniverse({ stocks: [{ code: "72030", name: "トヨタ" }, { code: "7203", name: "dup" }, { code: "186a" }] });
    expect(u.stocks.map((s) => s.code)).toEqual(["7203", "186A"]);
    expect(u.stocks[1].name).toBe("186A");
  });
  it("不正コードは例外", () => {
    expect(() => parseUniverse({ stocks: [{ code: "12" }] })).toThrow();
  });
  it("同梱の universe.json が読める", () => {
    const u = loadUniverse();
    expect(u.stocks.length).toBeGreaterThan(0);
  });
});
