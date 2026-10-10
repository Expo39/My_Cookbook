export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

RUN := docker compose run --rm dev
WASM_OUT := web/src/lib/wasm
WASM_BIN := $(WASM_OUT)/cookbook_wasm_bg.wasm
DATA_OUT := web/static/data
DATA_STAMP := $(DATA_OUT)/manifest.json

RUST_SRC := Cargo.toml Cargo.lock $(shell find crates/cookbook-core crates/cookbook-wasm crates/cookbook-cli -type f \( -name '*.rs' -o -name Cargo.toml \) -not -path '*/tests/*')
RECIPE_SRC := $(shell find recipes -type f -name '*.json' 2>/dev/null)

.PHONY: image dev test-fast test check build wasm data types fmt lint shell install

image:
	docker compose build dev

install:
	$(RUN) pnpm --dir web install --frozen-lockfile

wasm: $(WASM_BIN)

$(WASM_BIN): $(RUST_SRC) scripts/build-wasm.sh
	$(RUN) sh scripts/build-wasm.sh $(WASM_OUT)

data: $(DATA_STAMP)

$(DATA_STAMP): $(RECIPE_SRC) $(RUST_SRC)
	$(RUN) cargo run --quiet -p cookbook-cli -- build --out $(DATA_OUT)

types:
	$(RUN) pnpm --dir web gen:types

dev: install data wasm
	docker compose run --rm --service-ports dev pnpm --dir web dev --host 0.0.0.0

check:
	$(RUN) cargo run --quiet -p cookbook-cli -- check --all

test-fast: install data wasm
	$(RUN) cargo nextest run --workspace
	$(RUN) pnpm --dir web test
	@if [ -d recipes ] && [ -n "$$(ls -A recipes)" ]; then $(MAKE) --no-print-directory check; else echo "no recipes yet: skipping content check"; fi

build: install data wasm
	$(RUN) pnpm --dir web build

test: test-fast build
	$(RUN) pnpm --dir web e2e

fmt:
	$(RUN) sh -c 'cargo fmt --all && pnpm --dir web format'

lint:
	$(RUN) sh -c 'cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && pnpm --dir web check && pnpm --dir web lint'

shell:
	$(RUN) bash
