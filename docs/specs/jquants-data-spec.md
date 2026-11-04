# 契約ごとに利用可能なAPIとデータ格納期間

## プラン別API利用可否・データ格納期間

| 取得データ                | 取得方法                                                                                                                              | Free             | Light     | Standard   | Premium    | データ格納期間       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- | ---------- | ---------- | ------------- |
| 上場銘柄一覧               | [API](/ja/spec/eq-master) / [CSV](/dashboard/downloads/exchange-master?filter=equities/master)\*                                  | 12週間前〜 2年12週間前まで | 5年前まで     | 10年前まで     | 20年前まで     | 2008/5/7〜     |
| 株価四本値                | [API](/ja/spec/eq-bars-daily) / [CSV](/dashboard/downloads/price-data/stocks?filter=equities/bars/daily)\*                        | 12週間前〜 2年12週間前まで | 5年前まで     | 10年前まで     | 20年前まで     | 2008/5/7〜     |
| バリュエーション指標           | [API](/ja/spec/eq-valuation) / [CSV](/dashboard/downloads/price-data/stocks?filter=equities/valuation)\*                          | 12週間前〜 2年12週間前まで | 5年前まで     | 10年前まで     | 20年前まで     | 2008/7/8〜 ※1  |
| 財務情報                 | [API](/ja/spec/fin-summary) / [CSV](/dashboard/downloads/company-data/financial-statements?filter=fins/summary)\*                 | 12週間前〜 2年12週間前まで | 5年前まで     | 10年前まで     | 20年前まで     | 2008/7/7〜     |
| 決算発表予定日              | [API](/ja/spec/fin-earnings-date) / [CSV](/dashboard/downloads/company-data/financial-statements?filter=fins/earnings-date)\*     | 12週間前〜 2年12週間前まで | 5年前まで     | 10年前まで     | 20年前まで     | 2014/9/1〜     |
| 決算発表予定日（3・9月期決算会社のみ） | [API](/ja/spec/eq-earnings-cal)                                                                                                   | 取得可能             | 取得可能      | 取得可能       | 取得可能       | 直近データのみ       |
| 取引カレンダー              | [API](/ja/spec/mkt-cal) / [CSV](/dashboard/downloads/exchange-master?filter=markets/calendar)                                     | 12週間前〜 2年12週間前まで | 翌年末〜5年前まで | 翌年末〜10年前まで | 翌年末〜20年前まで | 翌年末〜2008/1/1  |
| 投資部門別情報              | [API](/ja/spec/eq-investor-types) / [CSV](/dashboard/downloads/reference-data?filter=equities/investor-types)                     | -                | 5年前まで     | 10年前まで     | 20年前まで     | 2008/1/16〜    |
| TOPIX四本値             | [API](/ja/spec/idx-bars-daily-topix) / [CSV](/dashboard/downloads/price-data/indices?filter=indices/bars/daily/topix)             | -                | 5年前まで     | 10年前まで     | 20年前まで     | 2008/5/7〜     |
| 指数四本値                | [API](/ja/spec/idx-bars-daily) / [CSV](/dashboard/downloads/price-data/indices?filter=indices/bars/daily)                         | -                | -         | 10年前まで     | 20年前まで     | 2008/5/7〜     |
| 日経225オプション四本値        | [API](/ja/spec/drv-bars-daily-opt-225) / [CSV](/dashboard/downloads/price-data/options?filter=derivatives/bars/daily/options/225) | -                | -         | 10年前まで     | 20年前まで     | 2008/5/7〜     |
| 先物四本値                | [API](/ja/spec/drv-bars-daily-fut) / [CSV](/dashboard/downloads/price-data/futures)                                               | -                | -         | -          | 20年前まで     | 2008/5/7〜     |
| オプション四本値             | [API](/ja/spec/drv-bars-daily-opt) / [CSV](/dashboard/downloads/price-data/options?filter=derivatives/bars/daily/options)         | -                | -         | -          | 20年前まで     | 2008/5/7〜     |
| 信用取引残高               | [API](/ja/spec/mkt-margin-int) / [CSV](/dashboard/downloads/reference-data?filter=markets/margin-interest)                        | -                | -         | 10年前まで     | 20年前まで     | 2012/2/10〜 ※2 |
| 業種別空売り比率             | [API](/ja/spec/mkt-short-ratio) / [CSV](/dashboard/downloads/reference-data?filter=markets/short-ratio)                           | -                | -         | 10年前まで     | 20年前まで     | 2008/11/5〜    |
| 空売り残高報告              | [API](/ja/spec/mkt-short-sale) / [CSV](/dashboard/downloads/reference-data?filter=markets/short-sale-report)                      | -                | -         | 10年前まで     | 20年前まで     | 2013/11/7〜    |
| 大株主状況（EDINET）        | [API](/ja/spec/edinet-major-shareholders)                                                                                         | -                | -         | 10年前まで     | 20年前まで     | 2016/6/1〜     |
| 政策保有株式（EDINET）       | [API](/ja/spec/edinet-cross-shareholdings)                                                                                        | -                | -         | 10年前まで     | 20年前まで     | 2020/3/31〜    |
| 大量保有報告書（EDINET）      | [API](/ja/spec/edinet-large-volume-shareholders)                                                                                  | -                | -         | 10年前まで     | 20年前まで     | 2021/7/1〜     |
| 日々公表信用取引残高           | [API](/ja/spec/mkt-margin-alert) / [CSV](/dashboard/downloads/reference-data?filter=markets/margin-alert)                         | -                | -         | 10年前まで     | 20年前まで     | 2008/5/8〜     |
| 売買内訳データ              | [API](/ja/spec/mkt-breakdown) / [CSV](/dashboard/downloads/reference-data?filter=markets/breakdown)                               | -                | -         | -          | 20年前まで     | 2015/4/1〜     |
| 前場四本値                | [API](/ja/spec/eq-bars-daily-am)                                                                                                  | -                | -         | -          | 取得可能       | 直近データのみ       |
| 配当金情報                | [API](/ja/spec/fin-dividend) / [CSV](/dashboard/downloads/company-data/dividends)                                                 | -                | -         | -          | 20年前まで     | 2013/2/20〜    |
| 財務諸表(BS/PL/CF)       | [API](/ja/spec/fin-details) / [CSV](/dashboard/downloads/company-data/financial-statements?filter=fins/details)                   | -                | -         | -          | 20年前まで     | 2009/1/13〜    |

> **Note**
>
> \* FreeプランではCSV形式でのデータ取得はできません（取引カレンダーを除く）。APIでのみ取得可能です。（有料プランの方はCSV形式での取得も可能です。）
>
> ※1 バリュエーション指標は、算出に用いる株式数や財務情報が揃っていない収録開始当初（2008年から2010年頃）は、指標が Null となる銘柄・項目が多くなります。
>
> ※2 信用取引残高の日次データは2026年9月25日申込分以降の収録です。それ以前は週末時点（通常は金曜日付）のデータのみを収録しています。
>
> \* 本ページに関してみなさまからいただいたご質問は [FAQ（プラン）](/ja/help/plan)・[FAQ（データ内容・仕様）](/ja/help/data) にまとめておりますので、ご不明点等ありましたらご参照ください。

### データ期間

> **Info**
>
> データ提供期間外（データ格納期間の開始日より前）のデータが必要な場合は、[J-Quants DataCube](https://dc.jpx-jquants.com) で提供している場合があります（個人・法人問わず購入可能）。

## アドオン別API利用可否・データ格納期間

| アドオン         | 取得データ              | 取得方法                                                                                                       | データ格納期間 |
| ------------ | ------------------ | ---------------------------------------------------------------------------------------------------------- | ------- |
| 株価 分足・ティック   | 株価分足               | [API](/ja/spec/eq-bars-minute) / [CSV](/dashboard/downloads/price-data/stocks?filter=equities/bars/minute) | 2年前まで   |
| 株価 分足・ティック   | 株価ティック             | [CSV](/dashboard/downloads/price-data/stocks?filter=equities/trades)                                       | 2年前まで   |
| TDnet/適時開示情報 | 適時開示インデックス一覧       | [API](/ja/spec/td-list)                                                                                    | 5年前まで   |
| TDnet/適時開示情報 | 適時開示ファイル取得         | [API](/ja/spec/td-files)                                                                                   | 5年前まで   |
| TDnet/適時開示情報 | 適時開示インデックス一括ダウンロード | [API](/ja/spec/td-bulk)                                                                                    | 5年前まで   |

## 提供データに関する留意事項

> **Note**
>
> - 時系列データとして提供している足種は商品ごとに異なります。株式は日足・分足・ティック、指数・先物・オプションは日足のみの提供です。いずれの商品も週足・月足は提供しておりません。週足・月足が必要な場合は、日足データをもとに利用者側で集計してください。
