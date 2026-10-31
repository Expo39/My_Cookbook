# cookbook-wasm

`wasm-bindgen` bindings over `cookbook-core`, loaded by the web app so that scaling, unit conversion, parsing, search and the checklist run on the device with the same code as the build.

The web app does not import these bindings directly; it goes through the typed wrapper in `web/src/lib/core/index.ts`.

## Exports

| Export | Purpose |
|---|---|
| `version()` | the crate version |
| `scale_recipe(...)` | scales a recipe for a request (servings, multiplier, pan or ingredient), with variants applied |
| `parse_ingredient_line(line)` | reads one written or pasted ingredient line (list bullets and numbers tidied away) into an ingredient |
| `check_recipe(recipe, id, context)` | runs the recipe checklist on one recipe |
| `check_removal(id, recipes)` | lists the recipes that still link to `id` |
| `SearchEngine` | built from `search.json`; `search(query)` and `ingredientsIHave(have)` |
| `toggle_unit(qty, unit)` | the next unit an amount cycles to |
| `convert(qty, from, to, food)` | converts between units, using the density of `food` where needed |
| `format_temperature(...)` | an oven or internal temperature in the chosen unit system |
| `servings_label(servings, noun)` | "1 person", "4 people" |
| `qr_matrix(text)` | a QR code matrix for the browser-drawn share card |

Values cross the boundary through `serde-wasm-bindgen`, with maps as plain objects and missing values as `null`.

## Building

```sh
make wasm
```

This runs `scripts/build-wasm.sh`, which builds the crate for `wasm32-unknown-unknown`, runs `wasm-bindgen` and `wasm-opt`, and writes the bundle to `web/src/lib/wasm`. The script fails if the gzipped module is over 200 KB.

## Tests

A native unit test sits in `src/lib.rs`. The bindings themselves are tested from JavaScript by the Vitest suite in `web/src/lib/core/core.test.ts`, which loads the built module, and by the Playwright suite.

```sh
cargo nextest run -p cookbook-wasm
```
