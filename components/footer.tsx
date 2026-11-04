export const DISCLAIMER = "寄りラボは情報提供のみを目的としており、投資助言ではありません。過去の統計は将来の成果を保証しません。";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-panel">
      <div className="mx-auto max-w-7xl space-y-1 px-4 py-3 text-xs text-muted">
        <p>{DISCLAIMER}</p>
        <p>板情報は見せ板などにより実態と異なる場合があり、板の偏りが値動きを予測するとは限りません。収集した板データは証券会社の利用規約に従い個人利用の範囲にとどめます。</p>
      </div>
    </footer>
  );
}
