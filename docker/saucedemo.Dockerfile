# syntax=docker/dockerfile:1
# Sauce Demo（Swag Labs）をローカルで動かすイメージ。ブラウザ操作モードの確認用（ADR 0021）
#
# Sauce Labs がテスト自動化の題材として公開しているサンプルのショップ（MIT ライセンス）。
# https://github.com/saucelabs/sample-app-web を決まったコミットで取り、ビルドした静的ファイルを nginx で配る。
# 公開サイト（saucedemo.com）には自動でアクセスしない。

FROM node:24.14.0-bookworm-slim AS build
# 2026-09-21 のコミット（アプリ本体はこれ以降変わっていない）
ARG SAUCE_DEMO_COMMIT=e0948dd03f0042ad24f5e9ca324657f13193c19f
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init -q \
 && git remote add origin https://github.com/saucelabs/sample-app-web.git \
 && git fetch -q --depth 1 origin "$SAUCE_DEMO_COMMIT" \
 && git checkout -q FETCH_HEAD
# husky などのインストール時のスクリプトは動かさない
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN node_modules/.bin/vite build

FROM nginx:1.27.5-alpine AS runtime
# 画面の URL（/inventory.html など）はすべて index.html で返す（SPA）
COPY <<'NGINX' /etc/nginx/conf.d/default.conf
server {
  listen 47303;
  root /usr/share/nginx/html;
  location / {
    try_files $uri /index.html;
  }
}
NGINX
COPY --from=build /src/build /usr/share/nginx/html
