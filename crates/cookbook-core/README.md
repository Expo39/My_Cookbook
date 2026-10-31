# cookbook-core

The domain logic of the cookbook: the recipe schema, scaling, units, the ingredient-line parser, step tokens, search, the site data shapes, QR codes and the recipe checklist.

The crate does no IO, so it compiles for both native targets and `wasm32-unknown-unknown`. The same code runs in `cookbook-cli` at build time, in `cookbook-server`, and in the browser through `cookbook-wasm`.

## Modules

| Module | Contents |
|---|---|
| `schema` | `Recipe`, `Section` and their parts, and `parse_recipe` / `parse_section`. This is the source of truth for [docs/RECIPE_FORMAT.md](../../docs/RECIPE_FORMAT.md) and the generated TypeScript types. |
| `scale` | `scale`, `apply_variants` and `factor_for`: scaling by servings, multiplier, pan size or one ingredient, with per-ingredient modes and warnings |
| `units` | units, conversion (`convert`, `toggle_unit`), the density table, °F and gas mark |
| `format` | display rounding and formatting: `display_amount`, `format_minutes`, `servings_label` |
| `parse` | `parse_ingredient_line`, which reads the editor's written ingredient list and the shopping list's own items |
| `tokens` | the step tokens (`{@key}`, `{temp:...}`, `{timer:...}`): parsing and rendering |
| `search` | the search index, accent-insensitive search, and ingredient coverage ("what can I make") |
| `site` | the shapes the site reads (`SiteIndex`, `RecipeData`, `Manifest`) and `build_site` |
| `checklist` | `check_all`, `check_recipe` and `check_removal`, with `E-` errors and `W-` warnings |
| `qr` | `qr_matrix`, for the share cards |

The main types and functions are re-exported from the crate root (see `src/lib.rs`).

## Tests

Every module has unit tests beside the code. They run natively with nextest; the WASM build is exercised by the web app's Vitest suite (`web/src/lib/core/core.test.ts`).

```sh
cargo nextest run -p cookbook-core
```
