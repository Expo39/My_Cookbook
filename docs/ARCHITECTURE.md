# Architecture

Sapori ta' l-kċina is a static site built from a tree of JSON recipes. A Rust core does the thinking, and it runs both in the build and in the browser, so the two can never disagree.

## The crates

| Crate | Role |
|---|---|
| `cookbook-core` | The schema, scaling, units, the ingredient-line parser, search, the site data shapes and the recipe checklist. It does no IO and builds for native and `wasm32`. |
| `cookbook-tree` | Reads the `recipes/` folder into a collection for the core. The only crate besides the CLI and the server that touches the file system for recipes. |
| `cookbook-wasm` | `wasm-bindgen` bindings over the core, loaded by `web/`. |
| `cookbook-cli` | `check`, `build`, `cards`, `verify-site`, `new`, `schema` and `migrate-legacy`. |
| `cookbook-ai` | The Gemini prompts and the request and response types shared by the Worker and the server. |
| `cookbook-worker` | The Cloudflare Worker that proxies the AI. |
| `cookbook-server` | An Axum server for optional self-hosting. |

## From recipes to the site

```
recipes/**/*.json
   | cookbook-cli check      the checklist; errors stop everything
   | cookbook-cli build      web/static/data: index.json, search.json, manifest.json, recipes/<id>.json
   | cookbook-cli cards      web/static/cards/<id>: og.png, portrait.png, story.png
   v
web/ (SvelteKit, adapter-static)    pnpm build -> web/build
   | cookbook-cli verify-site web/build
   v
GitHub Pages
```

- `build` runs the checklist first and also verifies its own output: the number of recipe files emitted, and that every recipe is in the search index.
- The SvelteKit catch-all route reads `index.json` at build time and pre-renders one page per section folder and per recipe. Each recipe page carries `Recipe` JSON-LD and Open Graph tags that point at its card.
- `verify-site` is the post-build gate. It fails unless the index lists exactly as many recipes as there are recipe files, and every recipe is pre-rendered, in the search index, has valid `Recipe` JSON-LD and has an Open Graph card.
- Photos are resized by `build` into `web/static/img`. The share cards are rendered by `cards` with `resvg` from the same template as the Open Graph images, and unchanged cards are skipped.
- `cookbook.config.json` holds the site address, the base path, the AI endpoint and the optional Instagram link. See [CONFIGURATION.md](CONFIGURATION.md).

## The core in the browser

`scripts/build-wasm.sh` compiles `cookbook-wasm` and fails if the gzipped result is over 200 KB. The app loads it once. Scaling, unit changes, the ingredient parser, search and the checklist then run on the device, and the pre-rendered page is usable before the module arrives (the scaling controls stay disabled until it has loaded). View state lives in the URL (`?serves=6&u=us`), so a link, a QR code and the print view all show the same recipe. Ticks, notes, favourites, timers and the shopping list are kept on the device.

A service worker caches the shell and the pages for offline use. The recipe JSON is cached as it is read.

## The data seams

`web/src/lib/data/` hides where recipes come from and go to:

- `RecipeSource` reads the index, a recipe and the search index. `StaticSource` fetches the built JSON, and `ApiSource` calls `cookbook-server`.
- `RecipeWriter` saves and deletes recipes. One writer commits through the GitHub API, and one calls the server.
- `AiClient` talks to the AI endpoint, either the Worker or the server.

`PUBLIC_BACKEND` selects the source at build time: `static` (the default) or `api`. `PUBLIC_AI_ENDPOINT` sets the AI endpoint, and the sous-chef is hidden when there is none. Moving off GitHub Pages means changing these variables and running the server image; no code changes.

## Where the checklist runs

The checklist is written once, in `cookbook-core/src/checklist.rs`, and runs in four places:

1. The admin editor, through WASM, before Save. Errors disable Save, and warnings are shown.
2. The `add-recipe` skill, with `cookbook-cli check <file>`.
3. CI and the build, with `cookbook-cli check --all` and `cookbook-cli build`.
4. The self-host server, before it writes a file.

## The AI Worker

`cookbook-worker` is a Rust Cloudflare Worker with two routes: `/chat` for the sous-chef, scoped to one recipe, and `/import`, which turns pasted text into a recipe and needs an admin proof. The Gemini key stays in the Worker's secrets, and requests are rate-limited per address. Prompts come from `cookbook-ai`. See `crates/cookbook-worker/README.md`.

## The self-host server

`cookbook-server` serves the built site and a JSON API with the same shapes as the static build. Behind an argon2 password and a signed session cookie it lets the editor write recipes, sections and images into the same `recipes/` tree, optionally committing each change, and it calls Gemini itself. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Tests

| Tier | Command | What runs | Budget |
|---|---|---|---|
| Fast | `make test-fast` | `cargo nextest` over the workspace, Vitest with `happy-dom`, and the recipe checklist | a few seconds on a warm cache; `nextest` flags any test over 5 s |
| Full | `make test` | the fast tier, the site build, `verify-site` and the Playwright suite against the built site | e2e under 90 s |
| CI | `.github/workflows/ci.yml` | the same checks as parallel jobs, with e2e and `verify-site` reusing the built `site` artifact | under 5 minutes |

The e2e suite never uses the dev server. It serves `web/build` with `web/scripts/serve-build.mjs`, mocks all network, runs Chromium on pull requests (and mobile WebKit when `FULL_E2E` is set) with reduced motion, and has a smoke test that runs once for every recipe file, so a new recipe is covered without a new test.

CI runs on pull requests into `main` and on pushes to `main`. The deploy workflow runs only after CI succeeds on a push, and publishes the very `site` artifact that CI built, tested and verified.
