"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type FormEvent } from "react";

/** バックテスト条件フォーム。送信で URL クエリを更新する */
export function BacktestForm() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s !== "") next.set(k, s);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`));
  };

  const g = (k: string, d = "") => sp.get(k) ?? d;
  const input = "w-24 rounded border border-border bg-panel px-1 py-0.5 tabular";
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-x-4 gap-y-2 text-xs">
      <label className="flex flex-col gap-1">
        <span className="text-muted">売買方向</span>
        <select name="side" defaultValue={g("side", "long")} className="rounded border border-border bg-panel px-1 py-0.5">
          <option value="long">寄り買い・引け売り</option>
          <option value="short">寄り売り・引け買い</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">ギャップ率 下限（%）</span>
        <input name="gapMin" type="number" step="0.1" defaultValue={g("gapMin")} className={input} placeholder="例: -3" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">ギャップ率 上限（%）</span>
        <input name="gapMax" type="number" step="0.1" defaultValue={g("gapMax")} className={input} placeholder="例: 3" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">出来高比 下限（倍）</span>
        <input name="minVolumeRatio" type="number" step="0.1" defaultValue={g("minVolumeRatio")} className={input} placeholder="例: 1.5" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">損切り（%）</span>
        <input name="stopLoss" type="number" step="0.1" min="0" defaultValue={g("stopLoss")} className={input} placeholder="空=引けまで" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">利確（%）</span>
        <input name="takeProfit" type="number" step="0.1" min="0" defaultValue={g("takeProfit")} className={input} placeholder="空=引けまで" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">直近N営業日（空=全期間）</span>
        <input name="days" type="number" step="1" min="1" defaultValue={g("days")} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">銘柄（空=全対象）</span>
        <input name="codes" defaultValue={g("codes")} className="w-40 rounded border border-border bg-panel px-1 py-0.5 font-mono" placeholder="7203,8306" />
      </label>
      <button type="submit" className="rounded border border-accent px-3 py-1 text-accent hover:bg-accent/10">
        {pending ? "計算中…" : "実行"}
      </button>
    </form>
  );
}
