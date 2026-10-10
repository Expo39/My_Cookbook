export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

RUN := docker compose run --rm dev
WASM_OUT := web/src/lib/wasm
WASM_BIN := $(WASM_OUT)/cookbook_wasm_bg.wasm
DATA_OUT := web/static/data
DATA_STAMP := $(DATA_OUT)/manifest.json

RUST_SRC := Cargo.toml Cargo.lock $(shell find crates/cookbook-core crates/cookbook-wasm crates/cookbook-cli crates/cookbook-tree -type f \( -name '*.rs' -o -name Cargo.toml \) -not -path '*/tests/*')
RECIPE_SRC := $(shell find recipes -type f 2>/dev/null)
CARDS_OUT := web/static/cards
CARDS_STAMP := $(CARDS_OUT)/.state.json
CARD_SRC := cookbook.config.json $(shell find assets -type f)

.PHONY: ascii verify hooks screenshots image dev test-fast test check build wasm data cards types fmt lint shell install worker-build server selfhost

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

cards: $(CARDS_STAMP)

$(CARDS_STAMP): $(RECIPE_SRC) $(RUST_SRC) $(CARD_SRC)
	$(RUN) cargo run --quiet -p cookbook-cli -- cards --out $(CARDS_OUT)

types:
	$(RUN) pnpm --dir web gen:types

dev: install data cards wasm
	docker compose run --rm --service-ports dev pnpm --dir web dev --host 0.0.0.0

check:
	$(RUN) cargo run --quiet -p cookbook-cli -- check --all

test-fast: install data wasm
	$(RUN) cargo nextest run --workspace
	$(RUN) pnpm --dir web test
	@if [ -d recipes ] && [ -n "$$(ls -A recipes)" ]; then $(MAKE) --no-print-directory check; else echo "no recipes yet: skipping content check"; fi

build: install data cards wasm
	$(RUN) pnpm --dir web build

verify: build
	$(RUN) cargo run --quiet -p cookbook-cli -- verify-site web/build

test: test-fast verify
	docker compose run --rm -e E2E_PREBUILT=1 dev pnpm --dir web e2e

fmt:
	$(RUN) sh -c 'cargo fmt --all && pnpm --dir web format'

lint: ascii
	$(RUN) sh -c 'cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && pnpm --dir web check && pnpm --dir web lint'

shell:
	$(RUN) bash

# Writes review screenshots of the built site into $(SHOTS), e.g. make screenshots SHOTS=/tmp/shots
SHOTS ?= $(CURDIR)/web/test-results/shots
screenshots: build
	mkdir -p $(SHOTS)
	docker compose run --rm -v $(SHOTS):/shots -e SHOTS_DIR=/shots -e SCREENSHOTS=1 -e E2E_PREBUILT=1 dev pnpm --dir web e2e

worker-build:
	$(RUN) sh -c 'cd crates/cookbook-worker && worker-build --release'

server:
	docker compose run --rm --service-ports -e COOKBOOK_ROOT=/work -e WEB_DIR=/work/web/build -e COOKIE_SECURE=false dev cargo run -p cookbook-server

selfhost:
	docker compose --profile selfhost up --build selfhost

# The pre-push hook runs `make test` before any push to main.
hooks:
	git config core.hooksPath .githooks

# Non-ASCII outside accented letters, the degree sign and fraction glyphs fails.
ascii:
	$(RUN) node scripts/check-ascii.mjs
