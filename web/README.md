# web

The SvelteKit app for the cookbook. It is pre-rendered with `adapter-static` into `web/build`, one page per section and per recipe, and published on GitHub Pages. In the browser it loads the WebAssembly build of `cookbook-core` for scaling, units, search and the recipe checklist.

The app reads data produced by `cookbook-cli` (`static/data`, `static/img`, `static/cards`) and the WASM bundle in `src/lib/wasm`. These are generated, not committed, so the `make` targets build them first.

## Commands

Run everything from the repository root through `make`, which uses the dev container:

| Command          | Runs                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `make dev`       | `pnpm dev`, the Vite dev server on port 5173                                                                 |
| `make build`     | `pnpm build`: icons, then `vite build` into `build/`                                                         |
| `make lint`      | `pnpm check` (`svelte-check --fail-on-warnings`) and `pnpm lint` (Prettier and ESLint), with the Rust checks |
| `make fmt`       | `pnpm format` (Prettier), with `cargo fmt`                                                                   |
| `make types`     | `pnpm gen:types`: regenerates `src/lib/types/recipe.ts` from the Rust schema                                 |
| `make test-fast` | `pnpm test` (Vitest), with the Rust tests and the checklist                                                  |
| `make test`      | `pnpm e2e` (Playwright) against the built site, after the fast tier                                          |

## Structure

| Path                      | Contents                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`             | the home page, the catch-all `[...path]` route for sections and recipes, `search`, `shopping-list`, `favourites`, `mine` (your own recipes), `how-to-use` (the guide and questions and answers), `offline` and the editor at `edit` |
| `src/lib/components/`     | the page components, with the editor's components in `admin/`                                                                                                                                                                       |
| `src/lib/data/`           | the data seams: `RecipeSource` and `RecipeWriter`, with static, GitHub, server and on-device implementations, and the export                                                                                                        |
| `src/lib/core/`           | the typed wrapper over the WASM bindings                                                                                                                                                                                            |
| `src/lib/admin/`          | the editor's session, encryption, GitHub client, form model, drafts, the written ingredient list and the plain-words checks                                                                                                         |
| `src/lib/ai/`             | the AI client, for the Worker or the server, with the status check and Turnstile, and the import proof                                                                                                                              |
| `src/lib/recipe/`         | the recipe view model, the URL view state and which ingredients each step uses                                                                                                                                                      |
| `src/lib/kitchen/`        | the shopping list, timers, the planner, wake lock and sharing text                                                                                                                                                                  |
| `src/lib/card/`           | the browser-drawn share card, from `assets/card-layout.json`                                                                                                                                                                        |
| `src/lib/seo/`            | `Recipe` JSON-LD and site metadata                                                                                                                                                                                                  |
| `src/lib/stores/`         | on-device state: favourites, recently viewed, notes, ticks, timers, the shopping list, your own recipes, the storage notice, theme and preferences                                                                                  |
| `src/lib/styles/`         | the design tokens, base styles and editor styles                                                                                                                                                                                    |
| `src/lib/types/recipe.ts` | the generated TypeScript types                                                                                                                                                                                                      |
| `src/service-worker.ts`   | the offline cache                                                                                                                                                                                                                   |
| `e2e/`                    | the Playwright suite                                                                                                                                                                                                                |
| `scripts/`                | `gen-icons.mjs`, `gen-types.mjs` and `serve-build.mjs`                                                                                                                                                                              |

## Data seams

Components never fetch JSON directly. They use `createSource()` and `createWriter()` from `src/lib/data/`, which choose an implementation from `PUBLIC_BACKEND` at build time:

- `static` (the default): `StaticSource` reads the built JSON, and `GitHubWriter` commits edits through the GitHub API.
- `server` (or `api`): `ApiSource` and `ApiWriter` call `cookbook-server`.

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#the-data-seams) and [docs/CONFIGURATION.md](../docs/CONFIGURATION.md).

## Styling

Styles follow [design-system/sapori/MASTER.md](../design-system/sapori/MASTER.md). Components use the tokens in `src/lib/styles/tokens.css`, scoped styles, no inline `style=` attributes and no dead selectors; `svelte-check` fails on unused selectors. Icons come from `src/lib/components/Icon.svelte`.

## Tests

- **Vitest** (`src/**/*.test.ts`, `happy-dom`): unit and component tests beside the code. Each test has 2 s.
- **Playwright** (`e2e/*.spec.ts`): runs against the built site served by `scripts/serve-build.mjs`, with all network mocked and reduced motion. The whole run fails past 90 s. `smoke.spec.ts` covers every recipe in the manifest automatically.

See [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md#tests-and-budgets).
