# 寄りラボ（Yori Lab）

日本株の時価総額上位銘柄を対象に、午前9時の寄り付きを起点としたデイトレードの傾向を、チャート（日足・分足）と板情報の両面から分析・可視化する**個人用ツール**です。

> 寄りラボは情報提供のみを目的としており、投資助言ではありません。過去の統計は将来の成果を保証しません。

## 現在の進捗

| 手順 | 内容 | 状態 |
|---|---|---|
| 0 | 外部仕様（J-Quants API V2 / kabuステーションAPI）の確認 | 完了（`docs/specs/`） |
| 1 | プロジェクト作成、リポジトリ層と SQLite スキーマ、J-Quants 日足取得・キャッシュ | 完了 |
| 2 | 日足分析ロジック（テスト付き）、ダッシュボード・銘柄詳細（日足）・簡易バックテスト | 完了 |
| 3 | `BoardProvider` と collector（板・約定の PUSH 受信と記録）、容量の見積もり | 完了（kabuステーション実機は未接続。モックで検証） |
| 4 | 板読み分析、板ヒートマップ・リプレイ、`/morning`、`/collector` | 完了（モックデータで検証） |
| 5 | 購読銘柄の自動選定、時価総額ランキング更新、Parquet 退避、Yahoo 分足（任意） | 完了（`update:universe` の適用は手動） |

## 重要な制約（必ず読んでください）

- **J-Quants Free プランは12週間遅延**です。取得できるのは「12週間前〜2年12週間前」の範囲で、直近の日足は含まれません。直近分は手順3以降に kabuステーションの受信データから自前生成した日足（出所 `kabu`）と、任意で Yahoo Finance 非公式 API（出所 `yahoo`）で補完します。同じ日に複数の出所があれば **J-Quants > kabu > Yahoo** の順で採用し、画面に出所を表示します。
- **板情報は無料の公開 API では取得できず、過去分も提供されません。** kabuステーションAPIから自前で記録・蓄積します。板分析の対象は記録開始日以降のデータだけです。
- **kabuステーションAPIの銘柄登録上限は50銘柄**（REST/PUSH 合算）です。対象200銘柄を同時に購読することはできないため、当日の購読銘柄を選定します。
- 日足では高値と安値のどちらが先に付いたか分かりません。損切り・利確を伴うバックテストでは「判定不能日」を明示します。
- 板は見せ板などで実態と異なる場合があり、板の偏りが値動きを予測するとは限りません。
- **クラウド同期・外部公開は行いません。** kabuステーションAPI利用規定（第3条）により、取得した情報の第三者への再配信・共同利用・閲覧端末以外への転載は禁止されています。本アプリは kabuステーションを動かす PC 内で完結させ、再配布機能は作りません。
- kabuステーションAPI利用規定 第3条9項により、**API のリクエスト時刻・呼び出しインターフェース・パラメータ等の利用状況は証券会社へ自動送信**されます。
- kabuステーションAPIの利用には **Professional プラン以上**が必要です（信用取引口座または先物オプション口座の開設と、判定期間内の約定1件以上。適用は翌月第1営業日までで、毎月更新されます）。

## 技術スタック

Next.js 16（App Router, Cache Components）/ TypeScript strict / Tailwind CSS v4 / lightweight-charts（ローソク足・分足）/ Canvas（板ヒートマップ）/ TanStack Table / SQLite（better-sqlite3）/ Parquet（@dsnp/parquetjs）/ Vitest / pnpm。

## セットアップ

```bash
pnpm install
cp .env.example .env            # JQUANTS_API_KEY を設定
cp collector/.env.example collector/.env   # 手順3以降。kabuステーションのAPIパスワードを設定
```

J-Quants の API キーは https://jpx-jquants.com/ のダッシュボード「API Keys」で発行します（V2。`x-api-key` ヘッダー方式）。

### 日足の取得（J-Quants）

```bash
pnpm fetch:daily                      # 差分取得（前回の続きから、取得可能な最新日まで）
pnpm fetch:daily --from 2025-01-01 --to 2025-03-31
pnpm fetch:daily --max-days 50        # 1回の実行で処理する営業日数を制限
pnpm fetch:daily --force              # 取得済みの日も再取得（調整済み株価の遡及再計算を反映したいとき）
pnpm fetch:fins                       # 財務サマリー（発行済株式数・EPS 等）を銘柄ごとに取得
pnpm db:stats                         # DB の件数・期間・サイズ
```

- 日付指定で全銘柄を一括取得し、`data/universe.json` の銘柄だけを保存します（`--all` で全銘柄保存）。
- Free プランは 5件/分（1分間のスライディングウィンドウ、429 になったリクエストもカウント対象、Retry-After ヘッダーなし。公式: https://jpx-jquants.com/ja/spec/rate-limits ）。クライアントはリクエスト間隔を 15 秒に均等化し（実測では 12 秒間隔でも 429 になるため余裕を持たせています）、429 を受けたら 120 秒待ってから再開します。
- 初回の全期間取得は約490営業日 ≒ **2時間前後**かかります。Ctrl+C で安全に中断でき、次回は未取得の営業日から再開します（進捗は `fetch_progress` テーブル）。**同じAPIキーで取得スクリプトを同時に2つ動かさないでください**（レート制限はアカウント単位で、429 が連鎖します）。
- ログは `logs/fetch-daily.log` に残ります。
- 財務サマリー（`/v2/fins/summary`）はプランに関わらず専用枠 60件/分なので、200銘柄でも約4分です。

### 画面の起動

```bash
pnpm dev          # http://localhost:3000
pnpm build && pnpm start
```

Next.js 側は SQLite をリクエストごとに開いて閉じます（長寿命の接続を持つと、別プロセスが WAL ファイルを作り直したときに古い内容を読み続けることがあるため）。取得スクリプトや collector が書いた内容は、ページを再読み込みすればそのまま反映されます。

API キーがなくても画面を確認できるよう、モックデータ生成を用意しています（実 DB とは別ファイル）。

```bash
pnpm seed:mock
YORI_DB_PATH=./data/db/mock.sqlite pnpm dev
```

### テスト・検証

```bash
pnpm test         # Vitest（分析ロジック・リポジトリ・クライアント）
pnpm typecheck
pnpm lint
```

## collector（板・約定の収集）

kabuステーションを起動している PC で、別プロセスとして動かします。

```bash
cp collector/.env.example collector/.env    # KABU_API_PASSWORD を設定
pnpm select:symbols                          # 当日の購読銘柄（最大50）を data/subscriptions/<date>.json に書く
pnpm collector                               # 常駐。Ctrl+C で停止
pnpm collector:mock                          # kabuステーションなしで動作確認（モック）
pnpm collector:mock --simulate --speed 30    # 1日分を高速再生して容量を見積もる（別DBを推奨: YORI_DB_PATH=./data/db/sim.sqlite）
```

1日の流れ（時刻は `collector/.env` で変更可）:

1. 06:30 以降にトークンを再発行（kabuステーションは毎朝 6:15 に強制ログアウトされるため）。kabuステーション自体のログインは手動です。
2. 記録開始の2分前（07:58）に PUSH 接続と銘柄登録（最大50）。
3. 08:00〜09:30 の板スナップショット（変化時のみ、最小間隔 1 秒、上位 10 本）と約定（PUSH の出来高差分から復元し、最良気配との比較で買い／売りに分類）、1分・5分足を記録。
4. 15:40 に REST で板を取り、自前の日足（出所 `kabu`）を保存。
5. 08:00 までに接続できていない場合は `/collector` 画面に警告を表示し、ログにも出します。切断時は指数バックオフで再接続し、受信が 15 秒途切れると欠損区間として記録します。

購読銘柄は `COLLECTOR_SYMBOLS` → `data/subscriptions/<当日>.json`（`pnpm select:symbols` が生成。ルールは `data/selection.json`）→ `data/universe.json` の先頭の順に決まります。最初は 5〜10 銘柄で数日動かして容量を確認してから増やしてください。

### 容量の目安（モックでの実測）

8 銘柄 × 90 分（8:00〜9:30）、スナップショット間隔 1 秒、板 10 本で、SQLite の増分は約 11.7 MB（スナップショット約 25,000 件、約定約 8,600 件）でした。1 銘柄・1 日あたり約 1.5 MB です。

| 購読銘柄数 | 1日 | 20営業日 |
|---|---|---|
| 10 | 約 15 MB | 約 0.3 GB |
| 50 | 約 75 MB | 約 1.5 GB |

モックは kabu の PUSH 間引き（400ms）と同程度の更新頻度を想定しています。実機では銘柄の流動性によって上下します。`COLLECTOR_SNAPSHOT_INTERVAL_MS` を 2000〜5000 にする、`COLLECTOR_BOARD_DEPTH` を 5 にすると減らせます。古い日は `pnpm archive` で Parquet に退避できます。

### 容量管理（Parquet 退避）

```bash
pnpm archive --list                        # 記録がある日の一覧
pnpm archive --before 2026-10-01           # それより前の日を data/archive/<date>/*.parquet に書き出す
pnpm archive --before 2026-10-01 --purge   # 書き出した後に SQLite から削除
```

## 分析機能

- **日足分析**（`lib/analysis/daily/`）: ギャップ率、寄り→引け騰落率、寄り→高値／安値率、出来高の直近平均比（20日）。期間集計（勝率、平均・中央値、累積、最大ドローダウン）、ギャップ方向別・ギャップ率区分別の統計（継続率／反転率）、銘柄間ランキング。既定の期間は「取得できる全期間」で、画面に分析期間とデータの出所を表示します。価格は分割調整済み（調整値のない出所は生値）を使います。
- **簡易バックテスト**（`/backtest`）: ギャップ率の範囲・出来高比・損切り・利確・売買方向を指定し、損益推移と成績を表示。損切りと利確の両方に到達した日は「判定不能」として除外し件数を表示します。
- **板読み分析**（`lib/analysis/board/`）: 板の厚み（上位N本の買い／売り比、スプレッド）、板の偏りの推移、大口注文の出現・消失、薄い価格帯、約定の買い／売り分類と時間帯別の買い圧力、オーダーフローインバランス（OFI、Cont et al. 2014）、寄り前の気配推移と始値との乖離・寄り直前の成行バランス、寄り後 1/5/15/30 分の値動き、条件別集計（サンプル 20 日未満は「参考」表示）。
- **画面**: `/stocks/[code]` は「日足分析」「板分析」タブ。板分析には当日の 1分・5分足、寄り前／寄り後の要約、板ヒートマップ（Canvas）、板リプレイ（スライダー・再生）、条件別集計があります。`/morning` は購読銘柄の気配・板の偏り・ギャップ見込み、`/collector` は収集状態・日別容量・セッション・欠損区間・警告を表示します。

## 任意: Yahoo Finance 非公式 API による補完

```bash
pnpm fetch:yahoo                 # 直近3ヶ月の日足と直近5日の5分足を universe 全銘柄で取得
pnpm fetch:yahoo --codes 7203,8306 --no-minute
```

非公式 API のため仕様変更や拒否（429）があり得ます。失敗した銘柄はスキップし、アプリの他の機能には影響しません。取得した日足は出所 `yahoo` として J-Quants・kabu より低い優先度で使われ、画面に出所が表示されます。

## 時価総額ランキングの自動更新

```bash
pnpm update:universe --dry-run   # 表示のみ
pnpm update:universe --top 200   # data/universe.json を上書き
```

方式: J-Quants 日足の `MktCap` は削除予定のため使わず、**バリュエーション指標 API（`/v2/equities/valuation`）の `MktCap`**（百万円、自己株式控除後）を採用しました。日付指定で全銘柄を 2 リクエスト（valuation + master）で取れ、Free プランでも使えます（12週間遅延）。kabuステーションの銘柄情報（`/symbol`）は 200 リクエストと kabuステーション起動が必要なため採用していません。内国株券（商品区分 011）以外（ETF・REIT・外国株）は除外し、既存の銘柄名は保持します。
universe を更新すると新しい銘柄の日足はまだ無いので、`pnpm fetch:daily --force` で取り直してください（約2時間）。

## 対象銘柄

`data/universe.json` に銘柄コード（4桁）・銘柄名・時価総額（任意、百万円）を管理します。現在はサンプル8銘柄のみです。手で追記するか、`pnpm update:universe --top 200` で J-Quants のバリュエーション指標から時価総額上位200銘柄を自動生成できます（上記「時価総額ランキングの自動更新」を参照）。

## ディレクトリ構成

```
app/                 Next.js（App Router）。/ /stocks/[code] /morning /backtest /collector
components/          共通 UI（ヘッダー、フッター免責、出所バッジ、設定）
lib/
  config.ts          環境変数（サーバー側のみ）
  codes.ts dates.ts  銘柄コード・日付ユーティリティ
  universe.ts        data/universe.json の読み込み
  db/                ドメイン型、リポジトリ層インターフェース、SQLite スキーマと実装
  jquants/           J-Quants V2 クライアント（レート制限、再試行、ページング）、型変換、取得ジョブ
  analysis/daily/    日足分析（純粋関数＋テスト）
  analysis/board/    板読み分析（純粋関数＋テスト）
  selection/         購読銘柄の選定
  yahoo/             Yahoo Finance 非公式 API（補完用、分離）
  archive/           Parquet 退避
  server/data.ts     Next.js からの DB 読み取り入口（Cache Components 対応）
scripts/             データ取得・モック生成 CLI（pnpm fetch:daily など）
collector/src/       収集プロセス（provider.ts = BoardProvider、kabu/ = kabuステーション実装、mock/ = モック）
data/universe.json   対象銘柄
data/db/             SQLite（git 管理外）
docs/specs/          参照した外部仕様の控え
```

### データ保存方針（SQLite）

- `daily_bars`: 日足。主キー (code, date, source)。
- `trading_calendar`: 取引カレンダー（休日区分 0〜3）。
- `fin_summaries`: 財務サマリー。主要項目をカラム化し、全項目を `raw`（JSON）に保持。
- `fetch_progress`: 取得ジョブの進捗（再開用）。
- `board_snapshots` / `trades` / `minute_bars` / `collector_*`: collector が書き込む板スナップショット・約定・分足・セッション／欠損区間。`trade_date` を持ち、日付単位で削除・Parquet 退避（`pnpm archive`）できる設計。板の気配は上位N本を JSON で保存。

リポジトリ層（`lib/db/repositories.ts`）のインターフェース経由でのみアクセスし、SQLite 実装は `lib/db/sqlite/` にあります。将来 DuckDB/Parquet などローカルの別実装に差し替えられます。

## 実機で確認が必要な項目

J-Quants（日足・財務・境界日）と Yahoo は実データで確認済みです。kabuステーションAPIは macOS からは接続できないため、以下は Windows の kabuステーション環境で確認してください。

- `pnpm collector` でトークン発行・PUSH 接続・銘柄登録ができること（`logs/collector.log`）。
- 実際の PUSH の更新頻度と 1 日の容量（`/collector` の日別データ量）。モックより多い場合は `COLLECTOR_SNAPSHOT_INTERVAL_MS` を増やす。
- 寄り前の気配種別（`0107` 等）と `CurrentPrice` が null で届くこと（寄り前判定に使用）。
- 15:40 の REST 板取得で `OpeningPrice`/`HighPrice`/`LowPrice`/`CurrentPrice` が揃い、自前日足が保存されること。
- 約定の復元精度（PUSH 400ms 間引きのため、歩み値 API `/timeandsales` との突き合わせは今後の課題）。

## 参考

- J-Quants API 仕様: https://jpx-jquants.com/ja/spec
- kabuステーションAPI ポータル: https://kabucom.github.io/kabusapi/ptal/
- kabuステーションAPI 利用規定: https://kabu.com/pdf/Gmkpdf/service/kabustationapiuserpolicy.pdf
