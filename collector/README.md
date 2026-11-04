# collector（手順3で実装）

kabuステーションAPIの PUSH 配信（WebSocket）を受信し、板スナップショットと約定を SQLite に記録する Next.js とは別の Node.js プロセスです。

- 記録時間帯: 8:00〜9:30（`collector/.env` で変更可）
- 毎朝 6:30 以降にトークンを再取得。8:00 までに API へ接続できない場合は `/collector` 画面とログに警告を出す
- 切断時の自動再接続と欠損区間の記録
- 認証情報は `collector/.env` のみで扱い、git には含めない
