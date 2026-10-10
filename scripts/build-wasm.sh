#!/bin/sh
# Builds the size-optimised wasm bundle into web/src/lib/wasm and enforces the gzip budget.
set -eu

OUT=${1:-web/src/lib/wasm}
TARGET_DIR=${CARGO_TARGET_DIR:-target}
BUDGET_KB=200
RAW=$TARGET_DIR/wasm32-unknown-unknown/wasm-release/cookbook_wasm.wasm
BG=$OUT/cookbook_wasm_bg.wasm

cargo build -p cookbook-wasm --target wasm32-unknown-unknown --profile wasm-release
wasm-bindgen --target web --out-dir "$OUT" "$RAW"

if command -v wasm-opt >/dev/null 2>&1; then
	wasm-opt -Oz --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int \
		--enable-mutable-globals -o "$BG.opt" "$BG"
	mv "$BG.opt" "$BG"
else
	echo "wasm-opt not found: skipping the extra size pass" >&2
fi

raw=$(wc -c <"$BG")
gz=$(gzip -9 -c "$BG" | wc -c)
echo "wasm: $raw bytes raw, $gz bytes gzipped (budget $((BUDGET_KB * 1024)))"
if [ "$gz" -gt $((BUDGET_KB * 1024)) ]; then
	echo "the gzipped wasm is over the ${BUDGET_KB} KB budget" >&2
	exit 1
fi
