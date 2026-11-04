import type { BarSource } from "@/lib/db/types";

/** 1銘柄・1営業日の寄り付き指標。価格は分割調整済み（調整値が無い出所は生値） */
export interface DailyMetric {
  code: string;
  date: string;
  source: BarSource;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  /** 前営業日（データ上の直前の有効な日）の終値 */
  prevClose: number;
  prevDate: string;
  /** ギャップ率 = (始値 − 前日終値) / 前日終値 */
  gapRate: number;
  /** 寄り→引け騰落率 = (終値 − 始値) / 始値 */
  openToClose: number;
  /** 寄り→高値率 = (高値 − 始値) / 始値（0以上） */
  openToHigh: number;
  /** 寄り→安値率 = (安値 − 始値) / 始値（0以下） */
  openToLow: number;
  /** 出来高の直近平均比（直近 N 日の平均に対する倍率）。履歴不足は null */
  volumeRatio: number | null;
}

export interface StrategyStats {
  count: number;
  /** 勝率（寄り→引け騰落率 > 0 の割合） */
  winRate: number | null;
  avgReturn: number | null;
  medianReturn: number | null;
  stdevReturn: number | null;
  /** 1単位ずつ毎日売買した場合の累積損益率 */
  totalReturn: number;
  /** 累積損益率の最大ドローダウン（0以上の値） */
  maxDrawdown: number;
}

export interface ConditionalStats extends StrategyStats {
  key: string;
  label: string;
  avgGapRate: number | null;
  avgOpenToHigh: number | null;
  avgOpenToLow: number | null;
  /** ギャップ方向と寄り→引けの方向が一致した割合（ギャップ0の日は除外） */
  continuationRate: number | null;
  /** ギャップ方向と逆に動いた割合 */
  reversalRate: number | null;
}

export interface GapBucket {
  key: string;
  label: string;
  /** 含む（null = 下限なし） */
  min: number | null;
  /** 含まない（null = 上限なし） */
  max: number | null;
}

/** 信頼度の目安。サンプルが少ない統計には注意書きを出す */
export const MIN_RELIABLE_SAMPLES = 30;
