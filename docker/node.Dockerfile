# syntax=docker/dockerfile:1
# web・api・mock-site 共通のイメージ。どれを起動するかは compose の command で選ぶ（ADR 0015）

FROM node:24.14.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# 依存だけを先に入れる（ソースを変えても再インストールしない）。compose.dev.yaml はここまでを使う
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/mock-site/package.json apps/mock-site/
COPY packages/shared/package.json packages/shared/
# キャッシュの id は本職の開発のビルドキャッシュと混ざらないよう、このプロジェクト専用にする
RUN --mount=type=cache,id=zero-second-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @zero-second/web build

# 実行時は pnpm を使わず、各アプリの node_modules/.bin から直接起動する
FROM build AS runtime
ENV NODE_ENV=production
RUN mkdir -p /data \
 && chown node:node /data \
 && chown -R node:node /app/apps/web/.next
USER node
