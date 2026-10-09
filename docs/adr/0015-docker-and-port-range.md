# 0015. Docker で動かし、ポートは 127.0.0.1 の 47300〜47302 に固定する

- ステータス: 採用
- 日付: 2026-10-09
- 関連: #22、[ADR 0002](0002-monorepo-pnpm-cargo.md)、[ADR 0004](0004-shared-sqlite-without-queue.md)、[ADR 0012](0012-mock-site-as-local-http-server.md)

## 背景

web・api・mock-site・striker を Docker に載せたい。ローカルの開発も Docker で動かせるようにしたい。

同じマシンで本職の開発もしており、そちらは 3000・3306・4000・5432・8000・8080・18000 などを使っている（2026-10-09 時点で 3000 は実際に使用中だった）。個人開発が本職の開発環境に影響しないことを最優先にする。

## 決定

### ポート

- web 47300 / api 47301 / mock-site 47302 に固定する（ホストで直接動かす場合も Docker でも同じ）。[ADR 0012](0012-mock-site-as-local-http-server.md) の 8788 などは、これで置き換える
- ホストでは 127.0.0.1 でのみ待ち受ける。Docker ではコンテナの中だけ 0.0.0.0 にし、ホストへの公開は `127.0.0.1:` に限る
- Docker でホストに公開するのは web と mock-site（ブラウザで公演ページを開くため）だけ。api と striker は compose のネットワークの中だけでつながる

### Docker

- イメージは 2 つ。`docker/node.Dockerfile`（web・api・mock-site 共通。起動するアプリは compose の command で選ぶ）と `docker/striker.Dockerfile`（release ビルド、debian-slim で実行）
- `compose.yaml` は本番相当。`compose.dev.yaml` を重ねると、ソースをマウントしてホットリロードする
- compose のプロジェクト名を `zero-second` に固定する。コンテナ・ネットワーク・ボリュームは `zero-second` で始まる名前になる。`container_name` やネットワークのサブネットは固定しない（Docker に空いているものを選ばせる）
- イメージ名は `zero-second-*:local`、ビルドキャッシュの id は `zero-second-*` にする
- SQLite は名前付きボリューム（本番相当 `data`、開発 `dev-data`）を api と striker で共有する。両方のイメージで uid 1000 を使う
- 開発時の node_modules・`.next`・Rust の target はコンテナ側のボリュームに置き、ホスト（macOS）のものと混ぜない
- `.env` は compose の `env_file` で渡し、接続先など Docker 固有の値は compose の `environment` で上書きする。`.env`・DB・HAR はイメージに入れない（`.dockerignore`）

## 理由

- 4730x は IANA の登録や一般的な開発ツールの既定と重ならず、本職のプロジェクトでも使っていない。macOS の一時ポート（49152〜）より下にある
- 127.0.0.1 に限れば、LAN から見えず、0.0.0.0 で待ち受ける本職のサービスとも衝突しない
- 公開するポートを最小にすれば、ぶつかる可能性も減る
- 名前に `zero-second` を付けておけば、`docker ps` などで本職のものと見分けられ、`docker compose down` も本職のコンテナに影響しない

## 検討した他の案

- 3000 / 8787 / 8788 のまま: 3000 は本職の開発と実際に衝突していた
- 環境変数でポートを自由に変えられるようにする: 設定がずれると壊れやすい（フォームが埋める URL など）。固定して ADR に残す方が確実
- api もホストに公開する: デバッグには便利だが、公開するポートを増やす理由にはならない。`docker compose exec api` で中から叩ける
- サブネットを固定する: 本職の VPN や compose と衝突する可能性があるので、Docker の自動割り当てに任せる

## 影響

- ホストで `make dev` を動かしているときに `make docker-up` / `make docker-dev` を使うと、このプロジェクトの中で 47300・47302 がぶつかる。どちらか一方だけを動かす
- ポートを変えたいときは、この ADR を置き換える ADR を書き、`.env.example`・`compose*.yaml`・`apps/web/package.json`・`packages/shared/src/{sites.json,mock.ts}` をそろえて変える
- CI でイメージのビルドを確かめるので、PR の CI は少し長くなる
