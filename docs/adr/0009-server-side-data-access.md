# 0009. Web から API へのアクセスはサーバー側だけにする

- ステータス: 採用
- 日付: 2026-10-09
- 関連: #7

## 背景

Web（Next.js）から API（Hono）を呼ぶ方法を決める必要があった。API は `127.0.0.1` でだけ待ち受け、`API_TOKEN` で保護できる。

## 決定

- 読み込みは Server Components から、更新は Server Actions から、`apps/web/src/lib/api.ts` 経由で API を呼ぶ
- ブラウザから API を直接呼ばない（CORS を開けない、トークンをブラウザに渡さない）
- 入力の検証は Server Action で `@zero-second/shared` の zod スキーマを使い、API でも同じスキーマで検証する
- データ取得は常にリクエスト時に行う（`connection()`）。ビルド時に API を呼ばない

## 理由

- API のトークンや接続先をブラウザに出さずに済む
- 検証ルールが 1 か所にまとまる

## 検討した他の案

- ブラウザから fetch: CORS とトークンの扱いが増える
- Next.js の Route Handlers に API を寄せる: ワーカーと共有する API を Next.js に依存させたくない

## 影響

- カウントダウンなど、ブラウザで動く部分は受け取った値だけを使う
- API が落ちているとページ全体がエラー表示になる（`error.tsx` で起動方法を案内する）
