/**
 * SQLite スキーマ。
 * 設計方針:
 * - 板・約定など日次で増えるテーブルは trade_date 列を持ち、日付単位で削除・Parquet 退避できるようにする
 * - 日足は source 列で出所を区別し、同一日に複数出所があればリポジトリ側で優先順位マージする
 * - スキーマ変更は MIGRATIONS に追記し、schema_version で管理する
 */

export const MIGRATIONS: readonly { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_bars (
  code TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('jquants','kabu','yahoo')),
  open REAL, high REAL, low REAL, close REAL,
  volume REAL, turnover REAL,
  adj_factor REAL, adj_open REAL, adj_high REAL, adj_low REAL, adj_close REAL, adj_volume REAL,
  upper_limit INTEGER, lower_limit INTEGER,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (code, date, source)
);
CREATE INDEX IF NOT EXISTS idx_daily_bars_date ON daily_bars (date);

CREATE TABLE IF NOT EXISTS trading_calendar (
  date TEXT PRIMARY KEY,
  hol_div TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fin_summaries (
  code TEXT NOT NULL,
  disc_date TEXT NOT NULL,
  disc_time TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  cur_per_type TEXT NOT NULL,
  cur_fy_start TEXT, cur_fy_end TEXT,
  shares_outstanding REAL, treasury_shares REAL, avg_shares REAL,
  eps REAL, bps REAL, sales REAL, operating_profit REAL, ordinary_profit REAL, net_profit REAL,
  raw TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (code, disc_date, disc_time, doc_type)
);

CREATE TABLE IF NOT EXISTS fetch_progress (
  job TEXT NOT NULL,
  key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done','error')),
  rows INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job, key)
);

-- ---- 以下は手順3（collector）で使うテーブル。日付単位で退避できるよう trade_date を持つ ----
CREATE TABLE IF NOT EXISTS board_snapshots (
  trade_date TEXT NOT NULL,
  code TEXT NOT NULL,
  ts TEXT NOT NULL,                -- 受信時刻（ISO8601, JST）
  current_price REAL,
  current_price_time TEXT,
  volume REAL,                     -- 累計出来高
  vwap REAL,
  best_ask REAL, best_ask_qty REAL, best_ask_sign TEXT,
  best_bid REAL, best_bid_qty REAL, best_bid_sign TEXT,
  market_sell_qty REAL, market_buy_qty REAL,
  over_sell_qty REAL, under_buy_qty REAL,
  asks TEXT NOT NULL,              -- JSON: [[price, qty], ...] 売り気配（上位N本）
  bids TEXT NOT NULL,              -- JSON: [[price, qty], ...] 買い気配（上位N本）
  PRIMARY KEY (trade_date, code, ts)
);

CREATE TABLE IF NOT EXISTS trades (
  trade_date TEXT NOT NULL,
  code TEXT NOT NULL,
  seq INTEGER NOT NULL,            -- 同一銘柄・同一日の連番
  ts TEXT NOT NULL,
  price REAL NOT NULL,
  qty REAL NOT NULL,
  side TEXT CHECK (side IN ('buy','sell','unknown')),
  origin TEXT NOT NULL CHECK (origin IN ('push','rest')),
  PRIMARY KEY (trade_date, code, seq)
);
CREATE INDEX IF NOT EXISTS idx_trades_code_ts ON trades (code, ts);

CREATE TABLE IF NOT EXISTS minute_bars (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  interval_min INTEGER NOT NULL,   -- 1 or 5
  ts TEXT NOT NULL,                -- バー開始時刻
  open REAL, high REAL, low REAL, close REAL, volume REAL,
  source TEXT NOT NULL CHECK (source IN ('kabu','yahoo')),
  PRIMARY KEY (code, trade_date, interval_min, ts, source)
);

CREATE TABLE IF NOT EXISTS collector_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS collector_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collector_daily_stats (
  trade_date TEXT PRIMARY KEY,
  snapshots INTEGER NOT NULL DEFAULT 0,
  trades INTEGER NOT NULL DEFAULT 0,
  symbols INTEGER NOT NULL DEFAULT 0,
  db_bytes INTEGER,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    sql: `
-- 銘柄・日ごとの最新の時価情報（前日終値・始値・高安・現在値）。/morning のギャップ見込みや日足の補完に使う
CREATE TABLE IF NOT EXISTS board_day_info (
  trade_date TEXT NOT NULL,
  code TEXT NOT NULL,
  previous_close REAL,
  opening_price REAL,
  high_price REAL,
  low_price REAL,
  current_price REAL,
  calc_price REAL,
  volume REAL,
  best_ask REAL, best_ask_qty REAL, best_ask_sign TEXT,
  best_bid REAL, best_bid_qty REAL, best_bid_sign TEXT,
  market_buy_qty REAL, market_sell_qty REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, code)
);
`,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
