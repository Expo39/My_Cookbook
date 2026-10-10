# cookbook-cli

The command line tool that checks the recipe tree and builds everything the static site reads: the recipe data, the resized photos and the share cards. It also verifies a built site, prints the JSON Schema and converts the legacy single-page site.

It runs in the dev container; the `make` targets call it for the common cases.

## Usage

```sh
cargo run -p cookbook-cli -- [--root <dir>] [--config <file>] <command>
```

| Global option | Default | Meaning |
|---|---|---|
| `--root <dir>` | `recipes` | the folder holding the recipe tree |
| `--config <file>` | `cookbook.config.json` | the site settings; a missing file means the defaults |

## Commands

| Command | What it does | Make target |
|---|---|---|
| `check [--all] [--json] [paths...]` | Runs the schema and the recipe checklist over the whole tree, and reports on the given recipe files or folders (all of them with `--all` or no paths). `--json` prints the report as JSON. Exits non-zero on any error. | `make check` |
| `build [--out <dir>] [--images-out <dir>]` | Checks the tree, then writes `index.json`, `search.json`, `manifest.json` and `recipes/<id>.json` into `--out` (default `web/static/data`) and the resized photos into `--images-out` (default `web/static/img`). Nothing is built if the checklist has errors. | `make data` |
| `cards [--out <dir>] [--site-root <url>]` | Renders the Open Graph, portrait and story cards for every recipe into `--out/<id>/` (default `web/static/cards`), skipping cards that are up to date. `--site-root` is the address the QR codes link to; it defaults to `PUBLIC_SITE_URL` with `BASE_PATH`, then the `site` settings. | `make cards` |
| `verify-site [build]` | Checks a built site (default `web/build`): every recipe is listed, pre-rendered, in the search index, and has `Recipe` JSON-LD and an Open Graph card. | `make verify` |
| `schema [recipe\|section\|web]` | Prints the JSON Schema for recipes and sections, or one of them. `web` prints every type the web app consumes, which `make types` turns into TypeScript. | `make types` |
| `migrate-legacy <html> [--out <dir>]` | Converts the legacy single-page site's `index.html` into a recipe tree under `--out` (default `recipes`). | none |

Examples:

```sh
cargo run -p cookbook-cli -- check recipes/desserts
cargo run -p cookbook-cli -- check --all --json
cargo run -p cookbook-cli -- schema recipe
```

Environment variables read by the CLI: `PUBLIC_SITE_URL` and `BASE_PATH` (for `cards`) and `SOURCE_DATE_EPOCH` (for a reproducible build timestamp). See [docs/CONFIGURATION.md](../../docs/CONFIGURATION.md).

## Layout

| Module | Role |
|---|---|
| `src/main.rs` | argument parsing and the `check` and `schema` commands |
| `src/build.rs`, `src/images.rs` | the site data and the photo resizing |
| `src/cards/` | the share card layout, text and SVG rendering with `resvg`, from `assets/card-layout.json` |
| `src/verify.rs` | `verify-site` |
| `src/migrate/` | `migrate-legacy` |
| `src/report.rs` | the checklist report in text and JSON |
| `src/config.rs` | `cookbook.config.json` |

## Tests

Unit tests sit beside the code. Integration tests in `tests/` run the binary against fixtures in `tests/fixtures/`: `build`, `cards` (including decoding the QR code), `cli`, `photos`, `verify`, and a golden test of the legacy migration.

```sh
cargo nextest run -p cookbook-cli
```
