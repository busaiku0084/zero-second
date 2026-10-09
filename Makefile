.PHONY: setup dev dev-web dev-api dev-mock-site dev-striker docker-up docker-down docker-logs docker-dev docker-dev-down check check-fix type-check test

setup: .env
	pnpm install
	cargo fetch

# .env が無ければ .env.example から作り、ログイン情報の暗号化鍵を生成して入れる（既存の .env は触らない）
.env:
	sed "s|^CREDENTIALS_ENCRYPTION_KEY=.*|CREDENTIALS_ENCRYPTION_KEY=$$(openssl rand -base64 32)|" .env.example > .env
	@echo ".env を作成しました"

# web・api・モックサイト・ワーカーをまとめて起動する（Ctrl+C でまとめて止まる）
dev:
	$(MAKE) -j4 dev-api dev-mock-site dev-web dev-striker

dev-web:
	pnpm dev:web

dev-api:
	pnpm dev:api

dev-mock-site:
	pnpm dev:mock-site

# リポジトリ直下の .env を読み込んでから起動する
dev-striker:
	set -a; [ -f .env ] && . ./.env; set +a; cargo run -p striker

# lint + format（TS: Biome / Rust: rustfmt + clippy）
check:
	pnpm check
	cargo fmt --all --check
	cargo clippy --all-targets -- -D warnings

check-fix:
	pnpm check:fix
	cargo fmt --all

type-check:
	pnpm type-check

test:
	pnpm test
	cargo test

# ---- Docker（ADR 0015）。ポートは 127.0.0.1 の 47300（web）・47302（mock-site）だけを公開する ----

DEV_COMPOSE = docker compose -f compose.yaml -f compose.dev.yaml

# 本番相当のイメージで起動する（バックグラウンド）
docker-up: .env
	docker compose up -d --build
	@echo "http://127.0.0.1:47300"

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

# ソースをマウントしてホットリロードで起動する（フォアグラウンド。Ctrl+C で止まる）
# -V: 依存を入れ直したときに古い node_modules のボリュームを使わない
docker-dev: .env
	$(DEV_COMPOSE) up --build -V

docker-dev-down:
	$(DEV_COMPOSE) down
