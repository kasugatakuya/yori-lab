# 財務情報(/fins/summary)

`GET`    /v2/fins/summary

## APIの概要

財務情報の開示日・銘柄コードを指定して、決算短信などの財務情報サマリーを取得できます。\
銘柄コード（code）または日付（date）のいずれか一方、もしくは両方の指定が必要です。

## 本APIの留意点

> **Info**
>
> - **会計基準について**
>   - APIから出力される各項目名は日本基準（JGAAP）の開示項目が基準となっています。そのため、IFRSや米国基準（USGAAP）の開示データにおいては、経常利益の概念がありませんので、データが空欄となっています。
> - **開示書類（XBRL）との関係について**
>   - 本APIの各項目は、上場会社が提出したXBRLデータの値に基づいているため、決算短信のPDFと異なる場合がございます。
>   - XBRLデータが提出されていない開示（PDFのみの開示等）は、本APIの収録対象外です。
> - **項目のスケール、単位について**
>   - 金額項目は、決算短信の表示単位（百万円・千円等）に関わらず、開示されたXBRLデータの値に基づき円単位で収録しています。（外国会社の開示を含む）
>   - 当社側での単位換算・追加の丸め処理は行っておりません。
>   - 各項目の会計上の定義・記載基準につきましては、原典である当該決算短信をご参照ください。
> - **連結・非連結の項目について**
>   - 決算短信（連結）を提出する企業では、接頭辞 `NC` がない項目（`Sales`・`OP`・`TA` 等）に連結の値を、接頭辞 `NC` がある項目に個別の値を収録します。
>   - 決算短信（非連結）を提出する企業では、接頭辞 `NC` がない項目に個別の値を収録し、接頭辞 `NC` がある項目は空文字列となります。
>   - 業績予想の修正においては、XBRL定義に従い、接頭辞 `NC` がない項目に連結の値、接頭辞 `NC` がある項目に個別の値を収録します。
> - **決算期変更について**
>   - 本APIには決算期変更を直接示す項目はありません。同一銘柄の開示を時系列で確認し、会計年度終了日（`CurFYEn`）の変化でご判断ください。
> - **開示順序について**
>   - 開示番号は開示順序を保証するものではございません。開示順序の判定には開示日時・時刻（`DiscDate`・`DiscTime`）をご参照ください。
> - **記載のない項目について**
>   - 各レコードには当該開示書類に記載された値のみを収録しており、記載のない項目は空文字列となります。空文字列は値の記載がなかったことのみを示す仕様であり、前回開示からの変更の有無や、予想の撤回・未定といった状態を表すものではありません。
> - **業績予想の収録形式について**
>   - 業績予想の各項目には、単一の値で開示された予想値を収録しています。レンジ（幅）形式で開示された予想値は収録されません。
> - **予想項目について**
>   - 接頭辞 `Nx` がない項目（`FSales`・`FOP`・`FDivFY` 等）は当事業年度（`CurFYSt`〜`CurFYEn`）の予想値、接頭辞 `Nx` がある項目（`NxFSales`・`NxFOP`・`NxFDivFY` 等）は翌事業年度（`NxtFYSt`〜`NxtFYEn`）の予想値です。
>   - 通期決算短信（開示書類種別に `FYFinancialStatements` を含む開示）では、翌事業年度の予想として接頭辞 `Nx` のある項目のみ収録され、接頭辞 `Nx` のない項目は空文字列となります。
>   - 通期決算短信の翌事業年度の予想（`NxFOP` 等）とその後の業績予想の修正（`FOP` 等）を比較する場合は、銘柄コードに加えて、通期決算短信のレコードの `NxtFYSt`・`NxtFYEn` と業績予想修正のレコードの `CurFYSt`・`CurFYEn` を照合してください。なお、決算期変更があった場合は事業年度の期間が変わるため、この照合では対応付けられません。
> - **有無を示す項目について**
>   - `MatChgSub`・`SigChgInC`・`ChgByASRev`・`ChgNoASRev`・`ChgAcEst`・`RetroRst` は、決算短信の記載が「有」の場合は `"true"`、「無」の場合は `"false"` の文字列を返却します。決算短信への記載がない場合は空文字列（`""`）となります。
> - **一株あたり配当実績について**
>   - 決算短信に記載された値をそのまま収録しており、当社側で株式分割・株式併合を反映した遡及調整は行っておりません。事業年度の途中や決算期末の後に株式分割・併合が行われた場合、決算短信の配当欄をどのように記載するかは開示会社の判断によって異なります。当該配当の基準日時点の金額をそのまま記載する例と、分割・併合後の株式数に換算して記載する例のいずれも存在するため、一律に開示時点の値、あるいは基準日時点の値と定まるものではございません。
> - **適時開示インデックス一覧との同期について**
>   - [TDnet/適時開示インデックス一覧(/td/list)](/ja/spec/td-list)と本APIは同期しておりません。そのため、適時開示インデックス一覧での新規開示検知時点では当該開示の財務情報を取得できない可能性があります。取得できない場合は、時間を置いて再度ご確認ください。なお、同じ開示には本APIと適時開示インデックス一覧・[TDnet/適時開示ファイル取得(/td/files)](/ja/spec/td-files)で同じ開示番号（`DiscNo`）が付与されるため、`DiscNo` をキーに対応付けることができます。
> - **レートリミットについて**
>   - 本APIには[個別のレートリミット](/ja/spec/rate-limits#エンドポイントごとのレートリミット)が適用されます。過去データの一括取得など効率的なデータ取得については[ベストプラクティス](/ja/spec/rate-limits#ベストプラクティス)をご参照ください。
> - **四半期開示見直し対応に伴うAPI項目の追加について**
>   - 四半期開示見直し対応において、決算短信サマリー様式の記載事項が以下のとおり変更されます。
>     - **変更前：** 重要な⼦会社の異動（連結範囲の変更を伴う特定⼦会社の異動）
>     - **変更後：** 連結範囲の重要な変更
>   - この対応に伴い、2024/7/22より本APIのレスポンス項目に"SigChgInC"（期中における連結範囲の重要な変更）を追加いたします。
>   - 詳細は、データ項目概要欄をご覧ください。

> **Info**
>
> - 各データがJ-Quantsで利用可能となった日時は提供しておりません。更新頻度および更新時刻の目安は[提供データの更新タイミング](/ja/spec/data-update)をご参照ください。
>
> - データ仕様について過去にお問い合わせのあった内容は、[FAQ（データ内容・仕様）](/ja/help/data)にも記載しておりますので、あわせてご参照ください。

## データ訂正のポリシー

> **Info**
>
> - 本APIは、各社が開示した決算短信のデータを提供しております。当社で分割調整や訂正等による過去データの遡及修正は行っておらず、各レコードは開示時点の基準の値を保持しております。
> - 訂正開示には新しい開示番号（`DiscNo`）が割り振られ、既存レコードは上書きされません。訂正前のレコードも残るため、開示番号（`DiscNo`）・開示日（`DiscDate`）により、どの時点の開示に基づく値かを識別できます。
> - ただし、本APIでは開示が訂正であることを示す項目・フラグはございません。訂正前後の値を比較する場合は、同一銘柄の同一会計期間のレコードを開示日時順に並べてご確認ください。

> **Info**
>
> - 本サービスにおいて、データ不備・不足によるデータの追加・上書き修正を行う場合がございます。その場合には、[データ修正履歴・制約事項](/ja/spec/fix-data-info)に修正履歴を記載しておりますのでご参照ください。\
>   ※ 本ケースにおいては、API/CSV等での訂正履歴、訂正前データの提供は行っておりません。

## 財務情報データを取得します

`GET` `https://api.jquants.com/v2/fins/summary`

銘柄コード（code）または日付（date）の指定が必須となります。

### パラメータ及びレスポンス

銘柄コード（code）または日付（date）の指定が必須となります。\
各パラメータの組み合わせとレスポンスの結果については以下のとおりです。

- code: ✓, date: –, cursor: – → 指定された銘柄について全期間分の財務情報データ

- code: ✓, date: ✓, cursor: – → 指定された銘柄について指定された日付の財務情報データ

- code: –, date: ✓, cursor: – → 全上場銘柄について指定された日付の財務情報データ

- code: –, date: ✓, cursor: ✓ → 前回リクエスト以降の財務情報データを取得（Premiumプランのみ）

### cursorを使った財務情報の取得

cursorを使った差分取得の仕様については、[cursorを使った差分取得](/ja/spec/cursor)をご参照ください。

> **Note**
>
> cursorパラメータはPremiumプランでのみ利用可能です。

### Requests

### Headers

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| x-api-key | string | Required | APIキー       |

### Query Parameters

> **Note**
>
> **code** または **date** のいずれか一つの指定が必須です。

| Parameter       | Type   | Required | Description                                                                                                                                                       |
| --------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| code            | string | Optional | 銘柄コード（e.g. 86970 or 8697）  4桁もしくは5桁の銘柄コード                                                                                                                     |
| date            | string | Optional | 開示日付の指定（e.g. 2022-01-05 or 20220105）                                                                                                                              |
| cursor          | string | Optional | 差分取得のカーソル（Premiumプランのみ）  前回のレスポンスで返却された cursor を指定することで前回のリクエスト以降に配信されたデータを取得できます。pagination\_key と同時指定不可。  詳細は[cursorを使った差分取得](/ja/spec/cursor)をご参照ください。 |
| pagination\_key | string | Optional | 検索の先頭を指定する文字列  過去の検索で返却された pagination\_key を設定                                                                                                                |

### APIコールサンプルコード

/v2/fins/summary

**cURL**

```bash
curl -G https://api.jquants.com/v2/fins/summary \
-H "x-api-key: {{apiKey}}" \
-d code="{{code}}" \
-d date="{{date}}"
```

**JavaScript**

```javascript
import axios from 'axios'

const client = axios.create({
baseURL: 'https://api.jquants.com',
headers: { 'x-api-key': '{{apiKey}}' },
})

await client.get('/v2/fins/summary', {
params: {
  code: '{{code}}',
  date: '{{date}}',
},
})
```

**Python**

```python
import requests

headers = {"x-api-key": "{{apiKey}}"}
resp = requests.get(
  "https://api.jquants.com/v2/fins/summary",
  params={"code": "{{code}}", "date": "{{date}}"},
  headers=headers,
)
print(resp.json())
```

### Responses

### データ項目概要

> **Note**
>
> - 本APIのレスポンスは、**すべての項目をJSON文字列（string）で返却します**。金額・株数・比率などの数値項目も、数値型ではなく文字列です（例: `"Sales": "100529000000"`）。
> - **欠損値・レコード不在について**
>   - 値が存在しない項目は `null` ではなく**空文字列**（`""`）が返却されます。
>   - 数値として扱う場合は、利用者側で空文字列の判定と数値への変換を行ってください。

| Parameter         | Type   | Required | Description                                                                                 |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------- |
| DiscDate          | string | Required | TDnetの開示日(JST)                                                                              |
| DiscTime          | string | Required | TDnetの開示時刻(JST)  秒は原データのまま収録しており、値は常に00です。                                              |
| Code              | string | Required | 銘柄コード（5桁）                                                                                   |
| DiscNo            | string | Required | 開示番号  APIから出力されるjsonは開示番号で昇順に並んでいます。                                                    |
| DocType           | string | Required | 開示書類種別  [開示書類種別一覧](/ja/spec/fin-summary/typeofdocument)                                 |
| CurPerType        | string | Required | 当会計期間の種類  \[1Q, 2Q, 3Q, 4Q, 5Q, FY]                                                     |
| CurPerSt          | string | Required | 当会計期間開始日                                                                                    |
| CurPerEn          | string | Required | 当会計期間終了日                                                                                    |
| CurFYSt           | string | Required | 当事業年度開始日                                                                                    |
| CurFYEn           | string | Required | 当事業年度終了日                                                                                    |
| NxtFYSt           | string | Required | 翌事業年度開始日  開示レコードに翌事業年度の開示情報がない場合空欄になります。                                                |
| NxtFYEn           | string | Required | 翌事業年度終了日  開示レコードに翌事業年度の開示情報がない場合空欄になります。                                                |
| Sales             | string | Required | 売上高                                                                                         |
| OP                | string | Required | 営業利益                                                                                        |
| OdP               | string | Required | 経常利益                                                                                        |
| NP                | string | Required | 当期純利益  親会社株主に帰属する当期純利益です。非支配株主持分を含む合計値ではありません。                                          |
| EPS               | string | Required | 一株あたり当期純利益                                                                                  |
| DEPS              | string | Required | 潜在株式調整後一株あたり当期純利益                                                                           |
| TA                | string | Required | 総資産                                                                                         |
| Eq                | string | Required | 純資産                                                                                         |
| EqAR              | string | Required | 自己資本比率                                                                                      |
| BPS               | string | Required | 一株あたり純資産                                                                                    |
| CFO               | string | Required | 営業活動によるキャッシュ・フロー                                                                            |
| CFI               | string | Required | 投資活動によるキャッシュ・フロー                                                                            |
| CFF               | string | Required | 財務活動によるキャッシュ・フロー                                                                            |
| CashEq            | string | Required | 現金及び現金同等物期末残高                                                                               |
| Div1Q             | string | Required | 一株あたり配当実績\_第1四半期末（日本円、1株当たり）                                                                |
| Div2Q             | string | Required | 一株あたり配当実績\_第2四半期末（日本円、1株当たり）                                                                |
| Div3Q             | string | Required | 一株あたり配当実績\_第3四半期末（日本円、1株当たり）                                                                |
| DivFY             | string | Required | 一株あたり配当実績\_期末（日本円、1株当たり）                                                                    |
| DivAnn            | string | Required | 一株あたり配当実績\_合計（日本円、1株当たり）                                                                    |
| DivUnit           | string | Required | 1口当たり分配金                                                                                    |
| DivTotalAnn       | string | Required | 配当金総額                                                                                       |
| PayoutRatioAnn    | string | Required | 配当性向                                                                                        |
| FDiv1Q            | string | Required | 一株あたり配当予想\_第1四半期末                                                                           |
| FDiv2Q            | string | Required | 一株あたり配当予想\_第2四半期末                                                                           |
| FDiv3Q            | string | Required | 一株あたり配当予想\_第3四半期末                                                                           |
| FDivFY            | string | Required | 一株あたり配当予想\_期末                                                                               |
| FDivAnn           | string | Required | 一株あたり配当予想\_合計（日本円、1株当たり）                                                                    |
| FDivUnit          | string | Required | 1口当たり予想分配金                                                                                  |
| FDivTotalAnn      | string | Required | 予想配当金総額                                                                                     |
| FPayoutRatioAnn   | string | Required | 予想配当性向                                                                                      |
| NxFDiv1Q          | string | Required | 一株あたり配当予想\_翌事業年度第1四半期末                                                                      |
| NxFDiv2Q          | string | Required | 一株あたり配当予想\_翌事業年度第2四半期末                                                                      |
| NxFDiv3Q          | string | Required | 一株あたり配当予想\_翌事業年度第3四半期末                                                                      |
| NxFDivFY          | string | Required | 一株あたり配当予想\_翌事業年度期末                                                                          |
| NxFDivAnn         | string | Required | 一株あたり配当予想\_翌事業年度合計（日本円、1株当たり）                                                               |
| NxFDivUnit        | string | Required | 1口当たり翌事業年度予想分配金                                                                             |
| NxFPayoutRatioAnn | string | Required | 翌事業年度予想配当性向                                                                                 |
| FSales2Q          | string | Required | 売上高\_予想\_第2四半期末                                                                             |
| FOP2Q             | string | Required | 営業利益\_予想\_第2四半期末                                                                            |
| FOdP2Q            | string | Required | 経常利益\_予想\_第2四半期末                                                                            |
| FNP2Q             | string | Required | 当期純利益\_予想\_第2四半期末                                                                           |
| FEPS2Q            | string | Required | 一株あたり当期純利益\_予想\_第2四半期末                                                                      |
| NxFSales2Q        | string | Required | 売上高\_予想\_翌事業年度第2四半期末                                                                        |
| NxFOP2Q           | string | Required | 営業利益\_予想\_翌事業年度第2四半期末                                                                       |
| NxFOdP2Q          | string | Required | 経常利益\_予想\_翌事業年度第2四半期末                                                                       |
| NxFNp2Q           | string | Required | 当期純利益\_予想\_翌事業年度第2四半期末                                                                      |
| NxFEPS2Q          | string | Required | 一株あたり当期純利益\_予想\_翌事業年度第2四半期末                                                                 |
| FSales            | string | Required | 売上高\_予想\_期末                                                                                 |
| FOP               | string | Required | 営業利益\_予想\_期末                                                                                |
| FOdP              | string | Required | 経常利益\_予想\_期末                                                                                |
| FNP               | string | Required | 当期純利益\_予想\_期末                                                                               |
| FEPS              | string | Required | 一株あたり当期純利益\_予想\_期末                                                                          |
| NxFSales          | string | Required | 売上高\_予想\_翌事業年度期末                                                                            |
| NxFOP             | string | Required | 営業利益\_予想\_翌事業年度期末                                                                           |
| NxFOdP            | string | Required | 経常利益\_予想\_翌事業年度期末                                                                           |
| NxFNp             | string | Required | 当期純利益\_予想\_翌事業年度期末                                                                          |
| NxFEPS            | string | Required | 一株あたり当期純利益\_予想\_翌事業年度期末                                                                     |
| MatChgSub         | string | Required | 期中における重要な子会社の異動                                                                             |
| SigChgInC         | string | Required | 期中における連結範囲の重要な変更  \*指定されたdateが2024-07-21以前のレスポンスは、当該項目には値が収録されず空文字列となります（項目自体は省略されません）。 |
| ChgByASRev        | string | Required | 会計基準等の改正に伴う会計方針の変更                                                                          |
| ChgNoASRev        | string | Required | 会計基準等の改正に伴う変更以外の会計方針の変更                                                                     |
| ChgAcEst          | string | Required | 会計上の見積りの変更                                                                                  |
| RetroRst          | string | Required | 修正再表示                                                                                       |
| ShOutFY           | string | Required | 期末発行済株式数                                                                                    |
| TrShFY            | string | Required | 期末自己株式数                                                                                     |
| AvgSh             | string | Required | 期中平均株式数                                                                                     |
| NCSales           | string | Required | 売上高\_非連結                                                                                    |
| NCOP              | string | Required | 営業利益\_非連結                                                                                   |
| NCOdP             | string | Required | 経常利益\_非連結                                                                                   |
| NCNP              | string | Required | 当期純利益\_非連結                                                                                  |
| NCEPS             | string | Required | 一株あたり当期純利益\_非連結                                                                             |
| NCTA              | string | Required | 総資産\_非連結                                                                                    |
| NCEq              | string | Required | 純資産\_非連結                                                                                    |
| NCEqAR            | string | Required | 自己資本比率\_非連結                                                                                 |
| NCBPS             | string | Required | 一株あたり純資産\_非連結                                                                               |
| FNCSales2Q        | string | Required | 売上高\_予想\_第2四半期末\_非連結                                                                        |
| FNCOP2Q           | string | Required | 営業利益\_予想\_第2四半期末\_非連結                                                                       |
| FNCOdP2Q          | string | Required | 経常利益\_予想\_第2四半期末\_非連結                                                                       |
| FNCNP2Q           | string | Required | 当期純利益\_予想\_第2四半期末\_非連結                                                                      |
| FNCEPS2Q          | string | Required | 一株あたり当期純利益\_予想\_第2四半期末\_非連結                                                                 |
| NxFNCSales2Q      | string | Required | 売上高\_予想\_翌事業年度第2四半期末\_非連結                                                                   |
| NxFNCOP2Q         | string | Required | 営業利益\_予想\_翌事業年度第2四半期末\_非連結                                                                  |
| NxFNCOdP2Q        | string | Required | 経常利益\_予想\_翌事業年度第2四半期末\_非連結                                                                  |
| NxFNCNP2Q         | string | Required | 当期純利益\_予想\_翌事業年度第2四半期末\_非連結                                                                 |
| NxFNCEPS2Q        | string | Required | 一株あたり当期純利益\_予想\_翌事業年度第2四半期末\_非連結                                                            |
| FNCSales          | string | Required | 売上高\_予想\_期末\_非連結                                                                            |
| FNCOP             | string | Required | 営業利益\_予想\_期末\_非連結                                                                           |
| FNCOdP            | string | Required | 経常利益\_予想\_期末\_非連結                                                                           |
| FNCNP             | string | Required | 当期純利益\_予想\_期末\_非連結                                                                          |
| FNCEPS            | string | Required | 一株あたり当期純利益\_予想\_期末\_非連結                                                                     |
| NxFNCSales        | string | Required | 売上高\_予想\_翌事業年度期末\_非連結                                                                       |
| NxFNCOP           | string | Required | 営業利益\_予想\_翌事業年度期末\_非連結                                                                      |
| NxFNCOdP          | string | Required | 経常利益\_予想\_翌事業年度期末\_非連結                                                                      |
| NxFNCNP           | string | Required | 当期純利益\_予想\_翌事業年度期末\_非連結                                                                     |
| NxFNCEPS          | string | Required | 一株あたり当期純利益\_予想\_翌事業年度期末\_非連結                                                                |
| ShEq              | string | Required | 自己資本                                                                                        |
| NCShEq            | string | Required | 自己資本\_非連結                                                                                   |
| ROE               | string | Required | 自己資本利益率                                                                                     |
| NCROE             | string | Required | 自己資本利益率\_非連結                                                                                |

### レスポンスサンプル

```bash {{ title: "200:OK" }}
{
    "data": [
        {
            "DiscDate": "2023-01-30",
            "DiscTime": "12:00:00",
            "Code": "86970",
            "DiscNo": "20230127594871",
            "DocType": "3QFinancialStatements_Consolidated_IFRS",
            "CurPerType": "3Q",
            "CurPerSt": "2022-04-01",
            "CurPerEn": "2022-12-31",
            "CurFYSt": "2022-04-01",
            "CurFYEn": "2023-03-31",
            "NxtFYSt": "",
            "NxtFYEn": "",
            "Sales": "100529000000",
            "OP": "51765000000",
            "OdP": "",
            "NP": "35175000000",
            "EPS": "66.76",
            "DEPS": "",
            "TA": "79205861000000",
            "Eq": "320021000000",
            "EqAR": "0.004",
            "BPS": "",
            "CFO": "",
            "CFI": "",
            "CFF": "",
            "CashEq": "91135000000",
            "Div1Q": "",
            "Div2Q": "26.0",
            "Div3Q": "",
            "DivFY": "",
            "DivAnn": "",
            "DivUnit": "",
            "DivTotalAnn": "",
            "PayoutRatioAnn": "",
            "FDiv1Q": "",
            "FDiv2Q": "",
            "FDiv3Q": "",
            "FDivFY": "36.0",
            "FDivAnn": "62.0",
            "FDivUnit": "",
            "FDivTotalAnn": "",
            "FPayoutRatioAnn": "",
            "NxFDiv1Q": "",
            "NxFDiv2Q": "",
            "NxFDiv3Q": "",
            "NxFDivFY": "",
            "NxFDivAnn": "",
            "NxFDivUnit": "",
            "NxFPayoutRatioAnn": "",
            "FSales2Q": "",
            "FOP2Q": "",
            "FOdP2Q": "",
            "FNP2Q": "",
            "FEPS2Q": "",
            "NxFSales2Q": "",
            "NxFOP2Q": "",
            "NxFOdP2Q": "",
            "NxFNp2Q": "",
            "NxFEPS2Q": "",
            "FSales": "132500000000",
            "FOP": "65500000000",
            "FOdP": "",
            "FNP": "45000000000",
            "FEPS": "85.42",
            "NxFSales": "",
            "NxFOP": "",
            "NxFOdP": "",
            "NxFNp": "",
            "NxFEPS": "",
            "MatChgSub": "false",
            "SigChgInC": "",
            "ChgByASRev": "false",
            "ChgNoASRev": "false",
            "ChgAcEst": "true",
            "RetroRst": "",
            "ShOutFY": "528578441",
            "TrShFY": "1861043",
            "AvgSh": "526874759",
            "NCSales": "",
            "NCOP": "",
            "NCOdP": "",
            "NCNP": "",
            "NCEPS": "",
            "NCTA": "",
            "NCEq": "",
            "NCEqAR": "",
            "NCBPS": "",
            "FNCSales2Q": "",
            "FNCOP2Q": "",
            "FNCOdP2Q": "",
            "FNCNP2Q": "",
            "FNCEPS2Q": "",
            "NxFNCSales2Q": "",
            "NxFNCOP2Q": "",
            "NxFNCOdP2Q": "",
            "NxFNCNP2Q": "",
            "NxFNCEPS2Q": "",
            "FNCSales": "",
            "FNCOP": "",
            "FNCOdP": "",
            "FNCNP": "",
            "FNCEPS": "",
            "NxFNCSales": "",
            "NxFNCOP": "",
            "NxFNCOdP": "",
            "NxFNCNP": "",
            "NxFNCEPS": "",
            "ShEq": "318500000000",
            "NCShEq": "",
            "ROE": "0.112",
            "NCROE": ""
        }
    ],
    "cursor": "eyJkIjoiMjAyNS0wNC0wMSIsInQiOiIyMDI1LTA0LTAxVDA4OjAwOjAwWiMyMDI1MDQwMTEzMDEwMCJ9"
}
```
