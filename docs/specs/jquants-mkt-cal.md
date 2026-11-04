# 取引カレンダー(/markets/calendar)

`GET`    /v2/markets/calendar

## APIの概要

東証およびOSEにおける営業日、休業日、ならびにOSEにおける祝日取引の有無の情報を取得できます。\
配信データは以下のページで公表している内容と同様です。

- 休業日一覧: [https://www.jpx.co.jp/corporate/about-jpx/calendar/index.html](https://www.jpx.co.jp/corporate/about-jpx/calendar/index.html)
- 祝日取引実施日: [https://www.jpx.co.jp/derivatives/rules/holidaytrading/index.html](https://www.jpx.co.jp/derivatives/rules/holidaytrading/index.html)

### 本APIの留意点

> **Info**
>
> - 東証およびOSEにおける営業日・休業日、東証における半日立会日、ならびにOSEにおける祝日取引の有無を、市場別に分けず単一のカレンダーとして提供しています。
> - 土日祝日を含むすべての暦日が対象で、非営業日は休日区分「0」として収録しています。
> - 原則として、毎年3月末頃をめどに翌年1年間の営業日および祝日取引実施日（予定）を更新します。更新履歴や公表時刻は提供していません。
> - 営業区分の訂正は原則ありません。カレンダーデータはレコード単位の版数や訂正フラグ・訂正識別子を持たない構成のため、レスポンスから訂正の有無を直接判別することはできません。
> - レスポンスに含まれるのはDateとHolDivのみで、リビジョンIDや更新日時に相当する項目、およびETag・Last-Modifiedといったヘッダは付与していません。
> - 通常の立会時間を示すデータ項目は提供していません。
> - 本APIに固有のpagination上限はありません。共通仕様は[レスポンスのページングについて](/ja/spec/pagination)をご確認ください。

> **Info**
>
> - 各データがJ-Quantsで利用可能となった日時は提供しておりません。更新頻度および更新時刻の目安は[提供データの更新タイミング](/ja/spec/data-update)をご参照ください。
>
> - データ仕様について過去にお問い合わせのあった内容は、[FAQ（データ内容・仕様）](/ja/help/data)にも記載しておりますので、あわせてご参照ください。

### データ訂正のポリシー

> **Info**
>
> - 本サービスにおいて、データ不備・不足によるデータの追加・上書き修正を行う場合がございます。その場合には、[データ修正履歴・制約事項](/ja/spec/fix-data-info)に修正履歴を記載しておりますのでご参照ください。\
>   ※ 本ケースにおいては、API/CSV等での訂正履歴、訂正前データの提供は行っておりません。

## 営業日のデータを取得します

`GET` `https://api.jquants.com/v2/markets/calendar`

データの取得では、休日区分（hol\_div）または日付（from/to）の指定が可能です。

### パラメータ及びレスポンス

データの取得では、休日区分（hol\_div）または日付（from/to）の指定が可能です。\
各パラメータの組み合わせとレスポンスの結果については以下のとおりです。

- hol\_div: ✓, from /to: – → 指定された休日区分について全期間分のデータ

- hol\_div: ✓, from /to: ✓ → 指定された休日区分について指定された期間分のデータ

- hol\_div: –, from /to: ✓ → 指定された期間分のデータ

- hol\_div: –, from /to: – → 全期間分のデータ

### Requests

### Headers

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| x-api-key | string | Required | APIキー       |

### Query Parameters

| Parameter | Type   | Required | Description                                                                                                                |
| --------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| hol\_div  | string | Optional | 休日区分  指定可能な値の一覧は[こちら](/ja/spec/mkt-cal/holiday-division)をご確認ください。  営業日のみ、あるいは特定の区分のみで絞り込みたい場合は、本パラメータで区分を指定してください。 |
| from      | string | Optional | from の指定（e.g. 20210901 or 2021-09-01）  指定日を含む期間で抽出します（両端を含みます）。                                                        |
| to        | string | Optional | to の指定（e.g. 20210907 or 2021-09-07）  指定日を含む期間で抽出します（両端を含みます）。from と同じ日付を指定することもできます。                                   |

### APIコールサンプルコード

/v2/markets/calendar

**cURL**

```bash
curl -G https://api.jquants.com/v2/markets/calendar \
-H "x-api-key: {{apiKey}}" \
-d hol_div="{{hol_div}}" \
-d from="{{from}}" \
-d to="{{to}}"
```

**JavaScript**

```javascript
import axios from 'axios'

const client = axios.create({
baseURL: "https://api.jquants.com",
headers: { "x-api-key": "{{apiKey}}" },
})

await client.get("/v2/markets/calendar", {
params: {
  hol_div: '{{hol_div}}',
  from: '{{from}}',
  to: '{{to}}',
},
})
```

**Python**

```python
import requests

headers = {"x-api-key": "{{apiKey}}"}
resp = requests.get(
  "https://api.jquants.com/v2/markets/calendar",
  params={
      "hol_div": "{{hol_div}}",
      "from": "{{from}}",
      "to": "{{to}}",
  },
  headers=headers,
)
print(resp.json())
```

### Responses

### データ項目概要

| Parameter | Type   | Required | Description                                            |
| --------- | ------ | -------- | ------------------------------------------------------ |
| Date      | string | Required | 日付（YYYY-MM-DD）                                         |
| HolDiv    | string | Required | 休日区分  [休日区分](/ja/spec/mkt-cal/holiday-division)を参照 |

### レスポンスサンプル

```bash {{ title: "200:OK" }}
{
    "data": [
        {
            "Date": "2015-04-01",
            "HolDiv": "1"
        }
    ]
}
```
