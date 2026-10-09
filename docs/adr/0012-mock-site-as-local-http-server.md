# 0012. 検証用のモックサイトをローカルの HTTP サーバーとして用意する

- ステータス: 採用
- 日付: 2026-10-09
- 関連: #19、[ADR 0005](0005-respect-site-terms.md)、[ADR 0011](0011-worker-polling-and-timing-buffer.md)

## 背景

自動購入を許可しているチケットサイトはまだ見つかっていない（[ADR 0005](0005-respect-site-terms.md)）。それでも、予約の登録からワーカーの購入、計測値の保存、ダッシュボードでの確認までを通しで動かして確かめたい。

骨格の段階の mock アダプタは HTTP を送らずに `sleep` するだけだったため、ログイン・時刻合わせ・購入のリクエストが `timings` に残らず、時刻合わせも実行されなかった。

## 決定

- 検証用のチケットサイトを `apps/mock-site`（Hono、`127.0.0.1:8788`）として用意する。実在のサイトの API を真似たものにはしない
- 公演 URL の末尾 `/events/{シナリオ}` で振る舞いを選ぶ。シナリオは `packages/shared/src/mock.ts` の `MOCK_SCENARIOS`（成功・混雑・低速・売り切れ・CAPTCHA）
- striker の `mock` アダプタは、公演 URL のオリジンへ実際に HTTP で送る（`POST /api/login` → `GET /api/events/{id}` → `HEAD /` で時刻合わせ → `POST /api/events/{id}/orders`）。セッションは Cookie で持つ
- `mock` アダプタは、ループバック（`127.0.0.0/8`・`::1`・`localhost`）以外の URL には送らずに失敗させる
- 応答の遅れ（`MOCK_SITE_LATENCY_MS`）と時計のずれ（`MOCK_SITE_CLOCK_SKEW_MS`）を環境変数で変えられる
- ワーカーの単体テストは、HTTP を使わない `sites/fake.rs`（テスト時のみ）で行う

## 理由

- 本物と同じ経路（`TimedClient`・Cookie・時刻合わせ・再試行）を通すので、計測値やダッシュボードの表示まで確かめられる
- シナリオを URL で選べば、DB スキーマや API に検証用の列を足さずに済む
- ループバックに限れば、モックの予約の URL を書き換えても外部のサイトにリクエストが飛ばない

## 検討した他の案

- モックを striker の中に組み込む（プロセス内でサーバーを立てる）: Rust に HTTP サーバーの依存が増え、ブラウザから公演ページを開いて確かめることもできない
- モックを API（`apps/api`）のルートとして足す: 本番の API と検証用のサイトが混ざり、Bearer 認証の扱いも複雑になる
- シナリオを予約の列（例: `mock_scenario`）で持つ: 検証のためだけにスキーマを変えることになる

## 影響

- `make dev` で web・api・mock-site・striker の 4 つを起動する
- モックサイトの URL を変えた場合（`MOCK_SITE_PORT`）、予約フォームが埋める URL（`MOCK_SITE_URL`）とずれるので手で直す
- 本物のサイトのアダプタを作るときも、`mock` アダプタと同じ形（`TimedClient` を通す・`SiteError` に振り分ける）で書ける
