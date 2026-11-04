/**
 * J-Quants API V2 の生レスポンス型。
 * 公式仕様: https://jpx-jquants.com/ja/spec/eq-bars-daily ほか
 * 数値項目は number のほか文字列（"" を含む）で返ることがあるため、変換は convert.ts に集約する。
 */

export type RawNumber = number | string | null | undefined;

export interface JQuantsEnvelope<T> {
  data: T[];
  pagination_key?: string;
}

/** /v2/equities/bars/daily */
export interface RawDailyBar {
  Date: string;
  Code: string;
  O: RawNumber;
  H: RawNumber;
  L: RawNumber;
  C: RawNumber;
  UL?: string | null;
  LL?: string | null;
  Vo: RawNumber;
  Va: RawNumber;
  AdjFactor: RawNumber;
  AdjO: RawNumber;
  AdjH: RawNumber;
  AdjL: RawNumber;
  AdjC: RawNumber;
  AdjVo: RawNumber;
  /** 削除予定（valuation API へ移行） */
  MktCap?: RawNumber;
  ExRT?: string | null;
  [key: string]: unknown;
}

/** /v2/markets/calendar */
export interface RawCalendarDay {
  Date: string;
  HolDiv: string;
}

/** /v2/fins/summary（主要項目のみ型付け。残りは index signature） */
export interface RawFinSummary {
  DiscDate: string;
  DiscTime: string;
  Code: string;
  DocType: string;
  CurPerType: string;
  CurFYSt?: string | null;
  CurFYEn?: string | null;
  Sales?: RawNumber;
  OP?: RawNumber;
  OdP?: RawNumber;
  NP?: RawNumber;
  EPS?: RawNumber;
  BPS?: RawNumber;
  ShOutFY?: RawNumber;
  TrShFY?: RawNumber;
  AvgSh?: RawNumber;
  [key: string]: unknown;
}

/** /v2/equities/master */
export interface RawMasterRow {
  Date: string;
  Code: string;
  CoName?: string;
  CoNameEn?: string;
  Mkt?: string;
  MktNm?: string;
  /** 商品区分: 011 内国株券, 012 優先出資証券, 013 REIT, 014 ETF, 021 外国株券 ... */
  ProdCat?: string;
  ScaleCat?: string;
  [key: string]: unknown;
}

/** /v2/equities/valuation */
export interface RawValuationRow {
  Date: string;
  Code: string;
  /** 時価総額（百万円）。自己株式控除後の株式数ベース */
  MktCap?: RawNumber;
  PER?: RawNumber;
  PBR?: RawNumber;
  [key: string]: unknown;
}
