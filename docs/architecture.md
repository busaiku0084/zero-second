# アーキテクチャ

## 全体の流れ

1. Web で予約（サイト・公演・席種・枚数・支払い方法・販売開始時刻）を登録する
2. API が `reservations` に `pending` で保存する
3. striker が販売開始の少し前に予約を取り出し、`login` → `prepare`（ID の取得・接続の確立）を行う
4. サーバー時刻とのずれを補正した時刻に `purchase` を実行する
5. 結果を `runs`、リクエスト単位の所要時間を `timings` に記録する
6. Web のダッシュボードで結果と所要時間の内訳を確認する

## 予約の状態

```
pending → preparing → running → succeeded
                              ↘ failed
                              ↘ needs_human（CAPTCHA・待機列・購入上限など）
```

## なぜこの構成か

- 速さを左右するのはネットワークの往復回数と事前準備なので、購入部分だけを Rust にして、画面と API は TS で手早く作る
- 個人利用で同時実行数も少ないため、キュー用のミドルウェアは使わず SQLite を共有する
