import { describe, expect, it } from "vitest";
import { isValidCode, normalizeCode, toJQuantsCode, toKabuSymbol } from "./codes";

describe("normalizeCode", () => {
  it("4桁はそのまま", () => {
    expect(normalizeCode("7203")).toBe("7203");
  });
  it("J-Quantsの5桁（末尾0）は4桁へ", () => {
    expect(normalizeCode("72030")).toBe("7203");
    expect(normalizeCode("186A0")).toBe("186A");
  });
  it("末尾が0以外の5桁はそのまま（優先株等）", () => {
    expect(normalizeCode("72035")).toBe("72035");
  });
  it("kabu形式の市場コードは落とす", () => {
    expect(normalizeCode("7203@1")).toBe("7203");
  });
  it("前後空白と小文字を正規化", () => {
    expect(normalizeCode(" 186a ")).toBe("186A");
  });
});

describe("toJQuantsCode / toKabuSymbol", () => {
  it("5桁へ変換", () => {
    expect(toJQuantsCode("7203")).toBe("72030");
    expect(toJQuantsCode("72030")).toBe("72030");
  });
  it("kabu形式へ変換", () => {
    expect(toKabuSymbol("7203")).toBe("7203@1");
    expect(toKabuSymbol("72030", 1)).toBe("7203@1");
  });
  it("isValidCode", () => {
    expect(isValidCode("7203")).toBe(true);
    expect(isValidCode("186A")).toBe(true);
    expect(isValidCode("72")).toBe(false);
    expect(isValidCode("ABCD")).toBe(false);
  });
});
