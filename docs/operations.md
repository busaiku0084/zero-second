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
- パスワードを忘れた場合の画面はまだない。管理者のパスワードを忘れたときは、API を止めて DB の `users` を直接直すか、`sessions`・`users` を消して `/setup` からやり直す

## ポート

本職の開発と競合しないよう、次の範囲に固定している（[ADR 0015](adr/0015-docker-and-port-range.md)）。すべて 127.0.0.1 でのみ待ち受ける。

| サービス | ポート | Docker でホストに公開するか |
|---|---|---|
| web | 47300 | する（`127.0.0.1:47300`） |
| api | 47301 | しない（compose のネットワークの中だけ） |
| mock-site | 47302 | する（`127.0.0.1:47302`。公演ページをブラウザで開くため） |
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
| ログインしてもすぐログイン画面に戻る | https 以外で `SESSION_COOKIE_SECURE=true` にしていると Cookie が保存されない。http://127.0.0.1 で使うなら外す |
| `make docker-dev` で画面のボタンが反応しない | `apps/web/next.config.ts` の `allowedDevOrigins` に開いているホスト（127.0.0.1 / localhost）が入っているか確認する |
| Web に「API に接続できません」と出る | `make dev-api` が動いているか、`API_URL` が正しいかを確認する |
| API の起動時に `CREDENTIALS_ENCRYPTION_KEY` のエラー | `.env` に 32 バイトの base64 を設定する |
| 予約が `preparing` / `running` のまま | ワーカーが途中で止まった可能性がある。ワーカーを起動し直すと `failed` に戻る。原因はワーカーのログで確認する |
| ワーカーの起動時に「マイグレーションが未適用です」 | 30 秒待っても API がマイグレーションを当てなかった。`make dev-api` が動いているか確認する |
| ワーカーの起動時に「MOCK_SITE_URL はループバックか Docker のサービス名にしてください」 | `MOCK_SITE_URL` が外部のホストになっている。`http://127.0.0.1:47302`（Docker では `http://mock-site:47302`）にする |
| `make docker-up` で「port is already allocated」 | ホストで `make dev` が動いている。止めてから使う。それ以外のプロセスが 4730x を使っていないかは `lsof -nP -iTCP:47300-47302 -sTCP:LISTEN` で確かめる |
| モックの予約がログインで失敗する | `make dev-mock-site` が動いているか確認する |
| 予約が「自動購入に対応していないサイトです」で失敗する | ワーカーにアダプタが登録されていないサイト。規約で自動化が禁止されたサイトは対応しない（ADR 0005） |
| `ExperimentalWarning: SQLite is an experimental feature` | `node:sqlite` の仕様上の警告で、動作に問題はない（[ADR 0006](adr/0006-node-sqlite.md)） |
