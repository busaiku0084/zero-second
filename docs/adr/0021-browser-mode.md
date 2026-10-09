# 0021. ワーカーにブラウザ操作モードを足し、Sauce Demo をローカルで動かして確かめる

- ステータス: 採用
- 日付: 2026-10-10
- 関連: #34、[ADR 0003](0003-rust-for-purchase-worker.md)、[ADR 0005](0005-respect-site-terms.md)、[ADR 0011](0011-worker-polling-and-timing-buffer.md)、[ADR 0015](0015-docker-and-port-range.md)

## 背景

自動購入は API を叩くモード（`TimedClient`）だけだった。API がなく、画面の操作でしか買えないサイトにも対応できるようにしたい。
動作確認の相手として、自動購入を明確に許可しているチケットサイトを探したが見つからなかった（TIGET・TicketDive・LivePocket は禁止、Peatix・teket は明記なし。docs/sites/README.md）。

## 決定

- **サイトごとに操作の方法を選ぶ**。`TicketSite::driver()` が `Driver::Http`（既定。API を叩く）か `Driver::Browser`（画面を操作する）を返す。API が使えるなら Http を選ぶ（速い）。→ [ADR 0022](0022-switchable-drivers-per-adapter.md) で、1 つのアダプタが両方を持てる `drivers()` に変えた
- ブラウザ操作は **ヘッドレス Chrome を CDP で操作する**（`chromiumoxide`。tokio で動き、Rust のワーカーの中で完結する）。`crates/striker/src/browser.rs` の `BrowserSession` が goto / click / fill / wait_for / wait_for_any / text を持ち、**操作ごとの所要時間を timings に残す**（method は GOTO / CLICK / TYPE / WAIT。入力した値は残さない）
- 待ち時間はすべて上限つき（要素は既定 10 秒、ページの移動は 15 秒）。CAPTCHA などは今までどおり `SiteError::HumanActionRequired` で止める
- 実行ごとに**空のプロファイル**で Chrome を起動し、終わったら消す。利用者の普段の Chrome には触れない。Docker では Chromium をワーカーのイメージに入れ、サンドボックスを外して動かす（開くのはローカルの検証用サイトだけ）
- ページの移動は `Page::goto`（読み込み完了の通知を待つ）を使わず、JavaScript で移動して URL と `document.readyState` を見て待つ。`goto` はまれに通知を取りこぼして 30 秒待ち続けたため
- 準備（prepare）で購入の直前の画面まで進め、要る値は `SiteContext::prepared` に読んでおく。販売開始の瞬間は最小限の操作（ボタン 1 回）にする
- 完了時刻は購入の処理が返った瞬間に取る（ブラウザを閉じる時間を所要時間に入れない）
- **動作確認は Sauce Demo（Swag Labs）で行う**。Sauce Labs がテスト自動化の題材として公開しているサンプルのショップ（MIT ライセンス）で、決済も注文も起きない。公開サイトには送らず、決まったコミットをビルドしてローカルの Docker（`127.0.0.1:47303`）で動かす。接続先はループバックか Docker のサービス名に限る
  - ポートの範囲を 47300〜47303 に広げる（ADR 0015 の方針どおり 127.0.0.1 のみ）
  - Sauce Demo のテストユーザー（standard_user・performance_glitch_user・locked_out_user・problem_user）で、成功・遅延・ログインの失敗・カートの失敗を確かめられる

## 理由

- chromiumoxide は async で、計測（timings）・再試行・時刻合わせなど今のワーカーの仕組みをそのまま使える。Playwright（Node）を別に動かすと、プロセスをまたいで計測や状態を受け渡すことになる
- WebDriver（chromedriver）より CDP のほうが往復が少なく、販売開始の瞬間の操作が速い
- Sauce Demo はテスト自動化のために公開されているので、利用規約の線（ADR 0005）を越えずに、実際の画面に近い流れで確かめられる。ローカルで動かせば外部のサーバーに負荷もかけない

## 検討した他の案

- Playwright（Node）をサイドカーで動かす: 機能は豊富だが、Rust のワーカーとの間で計測と状態をやり取りする仕組みが要る
- WebDriver（fantoccini + chromedriver）: chromedriver を別に用意する必要があり、操作ごとの往復が増える
- 公開の saucedemo.com に送る: 外部のサイトに負荷をかける。ローカルで足りる
- 実在のチケットサイトで仮実装する: 規約で禁止されているか、明記されていない。作らない（ADR 0005）

## 影響

- ワーカーのイメージが Chromium の分だけ大きくなる。CI の Docker のビルドに Sauce Demo（GitHub から取得してビルド）が加わる
- Chrome は 1 予約につき 1 つ起動する。同時に多くの予約を動かすとメモリを使う
- ホストの `make dev` でブラウザ操作モードを使うときは、ローカルの Chrome を使う（`STRIKER_CHROME_PATH`）。`STRIKER_BROWSER_HEADFUL=true` で画面を出して動きを見られる
