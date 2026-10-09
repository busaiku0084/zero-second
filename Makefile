.PHONY: setup dev dev-web dev-api dev-mock-site dev-striker check check-fix type-check test

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
