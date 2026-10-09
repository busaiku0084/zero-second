# syntax=docker/dockerfile:1
# 購入ワーカー（striker）のイメージ（ADR 0015）

# ブラウザ操作モード（ADR 0021）で使う Chromium（画面を撮らないので日本語のフォントは入れない）
ARG BROWSER_PACKAGES="chromium"

FROM rust:1-slim-bookworm AS build
WORKDIR /app
# rust-toolchain.toml は入れない（イメージの toolchain をそのまま使う）
COPY Cargo.toml Cargo.lock ./
COPY crates crates
# キャッシュの id はこのプロジェクト専用にする
RUN --mount=type=cache,id=zero-second-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=zero-second-cargo-target,target=/app/target \
    cargo build --release --locked -p striker \
 && cp target/release/striker /usr/local/bin/striker

FROM debian:bookworm-slim AS runtime
ARG BROWSER_PACKAGES
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates $BROWSER_PACKAGES \
 && rm -rf /var/lib/apt/lists/*
# api（node イメージの node ユーザー）と同じ uid にして、共有する SQLite を読み書きできるようにする
RUN useradd --uid 1000 --create-home striker \
 && mkdir -p /data \
 && chown striker:striker /data
COPY --from=build /usr/local/bin/striker /usr/local/bin/striker
USER striker
ENTRYPOINT ["striker"]

# 開発用（compose.dev.yaml）。ソースをマウントして cargo run する。Chromium も入れておく
FROM rust:1-slim-bookworm AS dev
ARG BROWSER_PACKAGES
RUN apt-get update \
 && apt-get install -y --no-install-recommends $BROWSER_PACKAGES \
 && rm -rf /var/lib/apt/lists/*
