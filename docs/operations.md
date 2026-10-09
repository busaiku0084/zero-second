# 運用メモ

## 起動

```bash
make setup                    # 初回のみ。.env が無ければ作り、暗号化鍵も生成する
make dev                      # 下の 4 つをまとめて起動（Ctrl+C でまとめて止まる）

make dev-api                  # API（起動時にマイグレーションを適用）
make dev-web                  # Web
make dev-mock-site            # 検証用のモックサイト
make dev-striker              # ワーカー（API がマイグレーションを当てるまで待ってから動く）
```

モックサイトでの確かめ方は `docs/architecture.md` の「モックサイトで通しで動かす」を参照。

## ログインとユーザー

[ADR 0016](adr/0016-login-and-per-user-data.md)。

1. 初めて開くと「最初のユーザーを作る」画面（`/setup`）になる。ここで作ったユーザーが管理者になる。ログイン機能より前の予約・アカウント・結果は、このユーザーに引き継がれる
2. ほかの人を追加するときは、管理者が「ユーザー」画面で招待リンクを作り、相手に送る。リンクは作ったときにしか表示されない。7 日間有効で、1 人だけ登録できる
3. 予約・アカウント・結果はユーザーごとに分かれていて、管理者にもほかの人の分は見えない

- https で公開するときは `.env` に `SESSION_COOKIE_SECURE=true` を設定する。招待リンクのホストを固定したいときは `APP_URL` を設定する
## ブラウザ操作モードを試す（Sauce Demo）

[ADR 0021](adr/0021-browser-mode.md)。Sauce Demo は Docker で動かす（`make docker-up` / `make docker-dev` に含まれる。ホストの `make dev` と組み合わせるなら `docker compose up -d saucedemo`）。

1. アカウントの画面で、サイト「Sauce Demo」にテストユーザーを登録する（パスワードは `secret_sauce`）
   - `standard_user`: 成功する / `performance_glitch_user`: ログインに約 5 秒かかる / `locked_out_user`: ログインできない / `problem_user`: id が奇数の商品をカートに入れられない
2. 予約の画面でサイト「Sauce Demo」と商品を選び、自動購入・枚数 1・アカウントを指定して「1 分後」で登録する
3. 販売開始の 2 分前にワーカーが Chrome を起動し、ログイン → カート → 注文情報の入力まで進めて待つ。販売開始の瞬間に Finish を押す
4. 実行結果の画面に、操作ごとの所要時間（GOTO / CLICK / TYPE / WAIT）が残る

ホストで動かすときに操作を目で見たいなら `.env` に `STRIKER_BROWSER_HEADFUL=true` を入れて `make dev-striker` を起動し直す。

## 通知

[ADR 0017](adr/0017-notifications.md)。API が 5 秒おきに確かめ、リマインドと自動購入の結果を送る。

- アプリ内（ヘッダーのベル）は設定なしで届く
- ブラウザ通知: `.env` の `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` が要る。`make setup` で作られる。以前に作った `.env` には `make web-push-keys` で足し、API（Docker なら `make docker-up`）を起動し直す。そのあと設定画面の「この端末で受け取る」を押す
- Discord / Slack: 設定画面に受信用 Webhook の URL を入れる
- 届かないときは、設定画面の「テスト通知を送る」で経路ごとの結果を確かめる。通知の一覧にも送信結果が残る

- パスワードを忘れたとき: 管理者が「ユーザー」画面の「再設定リンク」でリンクを作り、本人に渡す（24 時間・1 回限り。[ADR 0020](adr/0020-user-management.md)）
- 管理者が 1 人しかいなくてパスワードを忘れたとき: サーバーでリンクを出す
  ```bash
  pnpm --filter @zero-second/api exec tsx src/cli.ts reset-link <ログイン ID>          # ホスト
  docker compose exec api node_modules/.bin/tsx src/cli.ts reset-link <ログイン ID>     # Docker
  ```
- 使わなくなったユーザーは「停止」する（削除はしない）。ログイン・自動購入・リマインドが止まり、「再開」で戻る

## ポート

本職の開発と競合しないよう、次の範囲に固定している（[ADR 0015](adr/0015-docker-and-port-range.md)）。すべて 127.0.0.1 でのみ待ち受ける。

| サービス | ポート | Docker でホストに公開するか |
|---|---|---|
| web | 47300 | する（`127.0.0.1:47300`） |
| api | 47301 | しない（compose のネットワークの中だけ） |
| mock-site | 47302 | する（`127.0.0.1:47302`。公演ページをブラウザで開くため） |
| saucedemo | 47303 | する（`127.0.0.1:47303`）。Docker だけで動く。ブラウザ操作モードの確認用（[ADR 0021](adr/0021-browser-mode.md)） |
| striker | — | 待ち受けない |

ホストの `make dev` と Docker は同じポートを使うので、どちらか一方だけを動かす。

## Docker

```bash
make docker-up        # 本番相当のイメージをビルドして起動（バックグラウンド）→ http://127.0.0.1:47300
make docker-logs      # ログを追う
make docker-down      # 止める（DB のボリュームは残る）

make docker-dev       # ソースをマウントしてホットリロードで起動（フォアグラウンド）
make docker-dev-down
```

| ファイル | 内容 |
|---|---|
| `docker/node.Dockerfile` | web・api・mock-site 共通のイメージ（`deps` ステージは開発用） |
| `docker/striker.Dockerfile` | ワーカーのイメージ（release ビルド） |
| `compose.yaml` | 本番相当の構成 |
| `compose.dev.yaml` | 開発用の上書き（ソースのマウント、`tsx watch`・`next dev`・`cargo run`） |

- コンテナ・ネットワーク・ボリュームは `zero-second` で始まる名前になる（compose のプロジェクト名を固定している）
- `.env` は `env_file` で渡す。DB の場所・API の接続先・モックサイトの接続先は compose が上書きする
- DB は名前付きボリューム（本番相当 `zero-second_data`、開発 `zero-second_dev-data`）。バックアップは `docker compose cp api:/data ./backup` など
- 開発用の node_modules・`.next`・Rust の target はコンテナ側のボリュームにあり、ホストのものとは別
- 依存を変えたら `make docker-dev` をやり直す（`-V` で node_modules のボリュームを作り直す）
- Docker のものだけを消すときは `docker compose -f compose.yaml -f compose.dev.yaml down -v`（このプロジェクトのボリュームだけが消える）

`.env` はリポジトリ直下に置く。API・Web・ワーカーのいずれも、ここを読む。

| 変数 | 内容 |
|---|---|
| `API_PORT` | API のポート（既定 47301。変えない） |
| `API_URL` | Web から見た API の URL |
| `API_TOKEN` | 設定すると API に Bearer 認証が必要になる |
| `DATABASE_URL` | SQLite の場所 |
| `CREDENTIALS_ENCRYPTION_KEY` | ログイン情報の暗号化鍵（`openssl rand -base64 32`） |
| `MOCK_SITE_URL` | ワーカーがモックサイトへ送る先（既定 `http://127.0.0.1:47302`。Docker では `http://mock-site:47302`） |
| `API_HOST` / `MOCK_SITE_HOST` | 待ち受けるアドレス（既定 127.0.0.1。Docker の中だけ 0.0.0.0） |
| `MOCK_SITE_PORT` | モックサイトのポート（既定 47302。変えると予約フォームが埋める URL とずれる） |
| `MOCK_SITE_LATENCY_MS` | モックサイトの応答の遅れ（既定 30。0〜2 倍でばらつく） |
| `MOCK_SITE_CLOCK_SKEW_MS` | モックサイトの `Date` ヘッダーに足すずれ（既定 0。時刻合わせの確認用） |
| `STRIKER_POLL_INTERVAL_MS` | ワーカーが予約を確認する間隔（既定 1000） |
| `STRIKER_LEAD_MS` | 販売開始の何ミリ秒前に準備を始めるか（既定 120000） |
| `SAUCE_DEMO_URL` | ワーカー（ブラウザ）が開く Sauce Demo（既定 `http://127.0.0.1:47303`。Docker では `http://saucedemo:47303`） |
| `STRIKER_CHROME_PATH` | ブラウザ操作モードの Chrome（空なら標準の場所。Docker では `/usr/bin/chromium`） |
| `STRIKER_BROWSER_HEADFUL` | `true` で画面を出して動かす（ホストで操作を目で確かめるとき） |
| `STRIKER_CHROME_NO_SANDBOX` | `true` で Chrome のサンドボックスを外す（Docker の中だけ。compose が設定する） |
| `RUST_LOG` | ワーカーのログレベル（例: `striker=info`） |

## バックアップ

DB は 1 ファイルなので、API とワーカーを止めてから `data/` をコピーする。動かしたままなら `sqlite3 data/zero-second.sqlite ".backup backup.sqlite"` を使う。

## 暗号化鍵を変える

1. 新しい鍵を作る（`openssl rand -base64 32`）
2. 今は再暗号化の仕組みがないため、アカウントを削除して登録し直す
3. `.env` の `CREDENTIALS_ENCRYPTION_KEY` を新しい鍵にして API を再起動する

鍵をなくした場合も同じ手順で登録し直す。

## 困ったとき

| 症状 | 対処 |
|---|---|
| ログインできず「ログインの失敗が続いたため…」と出る | 同じ ID で 15 分に 5 回失敗した。時間をおくか、API を再起動すると解除される |
| ブラウザ通知が「サーバーにブラウザ通知の鍵が設定されていない」と出る | `make web-push-keys` で `.env` に鍵を足し、API を起動し直す |
| ブラウザ通知がオンにできない | ブラウザのサイトの設定で通知を許可する。http で使えるのは 127.0.0.1 / localhost だけ（それ以外は https が要る）。iPhone はホーム画面に追加すると使える |
| ログインしてもすぐログイン画面に戻る | https 以外で `SESSION_COOKIE_SECURE=true` にしていると Cookie が保存されない。http://127.0.0.1 で使うなら外す |
| `make docker-dev` で画面のボタンが反応しない | `apps/web/next.config.ts` の `allowedDevOrigins` に開いているホスト（127.0.0.1 / localhost）が入っているか確認する |
| Web に「API に接続できません」と出る | `make dev-api` が動いているか、`API_URL` が正しいかを確認する |
| API の起動時に `CREDENTIALS_ENCRYPTION_KEY` のエラー | `.env` に 32 バイトの base64 を設定する |
| 予約が `preparing` / `running` のまま | ワーカーが途中で止まった可能性がある。ワーカーを起動し直すと `failed` に戻る。原因はワーカーのログで確認する |
| ワーカーの起動時に「マイグレーションが未適用です」 | 30 秒待っても API がマイグレーションを当てなかった。`make dev-api` が動いているか確認する |
| ワーカーの起動時に「MOCK_SITE_URL はループバックか Docker のサービス名にしてください」 | `MOCK_SITE_URL` が外部のホストになっている。`http://127.0.0.1:47302`（Docker では `http://mock-site:47302`）にする |
| `make docker-up` で「port is already allocated」 | ホストで `make dev` が動いている。止めてから使う。それ以外のプロセスが 4730x を使っていないかは `lsof -nP -iTCP:47300-47303 -sTCP:LISTEN` で確かめる |
| モックの予約がログインで失敗する | `make dev-mock-site` が動いているか確認する |
| 予約が「自動購入に対応していないサイトです」で失敗する | ワーカーにアダプタが登録されていないサイト。規約で自動化が禁止されたサイトは対応しない（ADR 0005） |
| `ExperimentalWarning: SQLite is an experimental feature` | `node:sqlite` の仕様上の警告で、動作に問題はない（[ADR 0006](adr/0006-node-sqlite.md)） |
