/**
 * 銘柄コードの正規化。
 * - アプリ内部では4桁コード（英字含む。例: "7203", "186A"）で統一する。
 * - J-Quants API V2 は5桁コード（末尾に "0" を付けたもの。例: "72030"）を返す。
 *   優先株等が別途上場している銘柄は末尾が "0" 以外になりうるため、末尾 "0" のときだけ4桁に戻す。
 * - kabuステーションAPIは "7203@1" のように市場コードを付ける。
 */

export function normalizeCode(raw: string): string {
  const s = raw.trim().toUpperCase();
  const at = s.indexOf("@");
  const body = at >= 0 ? s.slice(0, at) : s;
  if (body.length === 5 && body.endsWith("0")) return body.slice(0, 4);
  return body;
}

/** J-Quants 用の5桁コード */
export function toJQuantsCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === 4 ? `${c}0` : c;
}

/** kabuステーション用の "コード@市場" 形式。市場コード 1 = 東証 */
export function toKabuSymbol(code: string, exchange = 1): string {
  return `${normalizeCode(code)}@${exchange}`;
}

export function isValidCode(code: string): boolean {
  return /^[0-9][0-9A-Z]{3}$/.test(normalizeCode(code));
}
