export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

RUN := docker compose run --rm dev
WASM_OUT := web/src/lib/wasm

.PHONY: image dev test-fast test check build wasm fmt lint shell install

image:
	docker compose build dev

install:
	$(RUN) pnpm --dir web install --frozen-lockfile

wasm:
	$(RUN) sh -c 'cargo build -p cookbook-wasm --target wasm32-unknown-unknown --release \
		&& wasm-bindgen --target web --out-dir $(WASM_OUT) target/wasm32-unknown-unknown/release/cookbook_wasm.wasm'

dev: install
	docker compose run --rm --service-ports dev pnpm --dir web dev --host 0.0.0.0

check:
	$(RUN) cargo run --quiet -p cookbook-cli -- check --all

test-fast: install
	$(RUN) cargo nextest run --workspace
	$(RUN) pnpm --dir web test
	@if [ -d recipes ] && [ -n "$$(ls -A recipes)" ]; then $(MAKE) --no-print-directory check; else echo "no recipes yet: skipping content check"; fi

build: install wasm
	$(RUN) pnpm --dir web build

test: test-fast build
	$(RUN) pnpm --dir web e2e

fmt:
	$(RUN) sh -c 'cargo fmt --all && pnpm --dir web format'

lint:
	$(RUN) sh -c 'cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && pnpm --dir web check && pnpm --dir web lint'

shell:
	$(RUN) bash
