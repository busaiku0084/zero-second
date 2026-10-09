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

`.env` はリポジトリ直下に置く。API・Web・ワーカーのいずれも、ここを読む。

| 変数 | 内容 |
|---|---|
| `API_PORT` | API のポート（既定 8787） |
| `API_URL` | Web から見た API の URL |
| `API_TOKEN` | 設定すると API に Bearer 認証が必要になる |
| `DATABASE_URL` | SQLite の場所 |
| `CREDENTIALS_ENCRYPTION_KEY` | ログイン情報の暗号化鍵（`openssl rand -base64 32`） |
| `MOCK_SITE_PORT` | モックサイトのポート（既定 8788。変えると予約フォームが埋める URL とずれる） |
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
| Web に「API に接続できません」と出る | `make dev-api` が動いているか、`API_URL` が正しいかを確認する |
| API の起動時に `CREDENTIALS_ENCRYPTION_KEY` のエラー | `.env` に 32 バイトの base64 を設定する |
| 予約が `preparing` / `running` のまま | ワーカーが途中で止まった可能性がある。ワーカーを起動し直すと `failed` に戻る。原因はワーカーのログで確認する |
| ワーカーの起動時に「マイグレーションが未適用です」 | 30 秒待っても API がマイグレーションを当てなかった。`make dev-api` が動いているか確認する |
| モックの予約が「ローカルのアドレスにしか送りません」で失敗する | 公演 URL が `127.0.0.1` / `localhost` 以外になっている。モックサイトの URL（`http://127.0.0.1:8788/events/{シナリオ}`）にする |
| モックの予約がログインで失敗する | `make dev-mock-site` が動いているか確認する |
| 予約が「自動購入に対応していないサイトです」で失敗する | ワーカーにアダプタが登録されていないサイト。規約で自動化が禁止されたサイトは対応しない（ADR 0005） |
| `ExperimentalWarning: SQLite is an experimental feature` | `node:sqlite` の仕様上の警告で、動作に問題はない（[ADR 0006](adr/0006-node-sqlite.md)） |
