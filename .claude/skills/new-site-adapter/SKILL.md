---
name: new-site-adapter
description: striker に新しいチケットサイトのアダプタを追加するときの手順。利用規約の確認から実装・記録までを行う。「〇〇に対応したい」「サイトを追加したい」で使う。
allowed-tools: Read, Glob, Grep, Edit, Write, WebFetch, Bash(cargo *), Bash(make *), Bash(git *)
---

# サイトアダプタの追加 (zero-second)

## Step 1: 利用規約の確認（必須・最初に行う）

対象サイトの利用規約・ガイドを読み、次を確認して `docs/sites/README.md` に記録する。

- 自動化ツール・BOT・スクリプトによる利用を禁止しているか
- リバースエンジニアリングや内部 API の解析を禁止しているか
- 公式 API が提供されているか、その利用条件
- 確認した日付と規約の改定日

**自動購入や BOT が禁止されている場合、アダプタは作らない。** ユーザーにその旨と根拠の条文を伝え、手で買うための補助機能（通知・リマインド・所要時間の記録など）で代替できないか提案して終える。
規約が読めない・判断がつかない場合も、実装に進まずにユーザーに確認する。

## Step 2: 購入フローの整理

許可されている手段（公式 API、または規約上問題のない範囲）で、購入の流れを `docs/sites/<site>.md` にまとめる。

- 販売開始前に取得できるもの / 開始後でないと取れないもの
- CAPTCHA・待機列・購入枚数上限の有無（あれば `HumanActionRequired` で止める地点として記録する）
- Cookie やトークンの実値はドキュメントに書かない

## Step 3: 実装

1. `crates/striker/src/sites/<site>.rs` に `TicketSite` を実装する
2. `crates/striker/src/sites/mod.rs` に登録する
3. 送るリクエストはすべて `RequestTiming` で計測する
4. 再試行には回数と間隔の上限を設ける
5. 記録済みレスポンス（実値を伏せたもの）を使ったテストを書く

## Step 4: 確認

`quality-gate` スキルを実行し、PASS を確認してから PR を出す。
