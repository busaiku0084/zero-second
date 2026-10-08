.PHONY: setup dev-web dev-api dev-striker check check-fix type-check test

setup:
	pnpm install
	cargo fetch

dev-web:
	pnpm dev:web

dev-api:
	pnpm dev:api

dev-striker:
	cargo run -p striker

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
