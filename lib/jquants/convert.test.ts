import { describe, expect, it } from "vitest";
import { convertCalendarDay, convertDailyBar, convertFinSummary, toFlag, toNum } from "./convert";

describe("toNum / toFlag", () => {
  it("number / 文字列 / 空 / null", () => {
    expect(toNum(1.5)).toBe(1.5);
    expect(toNum("2047.0")).toBe(2047);
    expect(toNum("1,234")).toBe(1234);
    expect(toNum("")).toBeNull();
    expect(toNum(" ")).toBeNull();
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum("abc")).toBeNull();
    expect(toNum(NaN)).toBeNull();
  });
  it("toFlag", () => {
    expect(toFlag("1")).toBe(true);
    expect(toFlag("0")).toBe(false);
    expect(toFlag(undefined)).toBeNull();
    expect(toFlag("")).toBeNull();
  });
});

describe("convertDailyBar", () => {
  it("公式サンプルを変換（5桁コード→4桁、短縮項目名）", () => {
    const bar = convertDailyBar(
      {
        Date: "2023-03-24",
        Code: "86970",
        O: 2047.0,
        H: 2069.0,
        L: 2035.0,
        C: 2045.0,
        UL: "0",
        LL: "0",
        Vo: 2202500.0,
        Va: 4507051850.0,
        AdjFactor: 1.0,
        AdjO: 2047.0,
        AdjH: 2069.0,
        AdjL: 2035.0,
        AdjC: 2045.0,
        AdjVo: 2202500.0,
        MktCap: 1083850.0,
        ExRT: null,
      },
      "2026-10-29T00:00:00.000Z",
    );
    expect(bar).toMatchObject({
      code: "8697",
      date: "2023-03-24",
      source: "jquants",
      open: 2047,
      close: 2045,
      volume: 2202500,
      turnover: 4507051850,
      adjFactor: 1,
      upperLimit: false,
      lowerLimit: false,
    });
  });
  it("無約定日（四本値 null）", () => {
    const bar = convertDailyBar(
      { Date: "2020-10-01", Code: "72030", O: null, H: null, L: null, C: null, Vo: null, Va: null, AdjFactor: 1, AdjO: null, AdjH: null, AdjL: null, AdjC: null, AdjVo: null },
      "x",
    );
    expect(bar.open).toBeNull();
    expect(bar.volume).toBeNull();
    expect(bar.upperLimit).toBeNull();
  });
});

describe("convertCalendarDay / convertFinSummary", () => {
  it("calendar", () => {
    expect(convertCalendarDay({ Date: "2015-04-01", HolDiv: "1" })).toEqual({ date: "2015-04-01", holDiv: "1" });
    expect(() => convertCalendarDay({ Date: "2015-04-01", HolDiv: "9" })).toThrow();
  });
  it("fin summary は文字列数値を変換し raw を保持", () => {
    const f = convertFinSummary(
      {
        DiscDate: "2026-05-08",
        DiscTime: "13:00:00",
        Code: "72030",
        DocType: "FYFinancialStatements_Consolidated_IFRS",
        CurPerType: "FY",
        CurFYSt: "2025-04-01",
        CurFYEn: "2026-03-31",
        Sales: "45000000000000",
        OP: "",
        OdP: "",
        NP: "4000000000000",
        EPS: "300.5",
        BPS: "",
        ShOutFY: "15794987000",
        TrShFY: "2000000",
        AvgSh: "",
      },
      "2026-10-29T00:00:00.000Z",
    );
    expect(f.code).toBe("7203");
    expect(f.sharesOutstanding).toBe(15794987000);
    expect(f.operatingProfit).toBeNull();
    expect(f.eps).toBe(300.5);
    expect(JSON.parse(f.raw).Code).toBe("72030");
  });
});
