# Development

This guide covers the local toolchain, the `make` targets, the repository's conventions, the test tiers and their budgets, how to extend the code, and common problems.

## Contents

- [Prerequisites](#prerequisites)
- [First run](#first-run)
- [Make targets](#make-targets)
- [Conventions](#conventions)
- [Tests and budgets](#tests-and-budgets)
- [Extending the code](#extending-the-code)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker with the Compose plugin (`docker compose`).
- GNU `make`.
- git.

Nothing else is installed on the host. Rust, Node, pnpm, `wasm-bindgen`, `wasm-opt`, cargo-nextest, Playwright with its browsers, and `worker-build` all live in the `dev` image built from `docker/dev.Dockerfile`. The `dev` service in `docker-compose.yml` mounts the repository at `/work`, runs as the host user (`HOST_UID` and `HOST_GID`, set by the `Makefile`) so that generated files are owned by that user, and keeps the Cargo registry, the Cargo target folder, the pnpm store and `web/node_modules` in named volumes.

## First run

```sh
make image       # build the dev image
make hooks       # install the pre-push hook
make dev         # install dependencies, build the data, cards and WASM, then start Vite
```

The dev server is then at <http://localhost:5173>. A change to a recipe needs `make data` (or a restart of `make dev`) to show up, because the site reads the built JSON in `web/static/data`.

## Make targets

Every target runs inside the `dev` container unless noted.

| Target | What it does |
|---|---|
| `make image` | Builds the `dev` image. Run it once, and again when `docker/dev.Dockerfile` changes. |
| `make install` | Installs the web dependencies with `pnpm install --frozen-lockfile`. |
| `make wasm` | Builds `cookbook-wasm` into `web/src/lib/wasm` with `scripts/build-wasm.sh`, enforcing the 200 KB gzip budget. Rebuilt only when the Rust sources change. |
| `make data` | Runs `cookbook-cli build`: checks the recipes and writes `web/static/data` and `web/static/img`. |
| `make cards` | Runs `cookbook-cli cards`: renders the share cards into `web/static/cards`. |
| `make types` | Regenerates `web/src/lib/types/recipe.ts` from the Rust schema. CI fails if the committed file is out of date. |
| `make dev` | `install`, `data`, `cards` and `wasm`, then the Vite dev server on port 5173. |
| `make check` | Runs the recipe checklist over every recipe (`cookbook-cli check --all`). |
| `make test-fast` | `install`, `data` and `wasm`, then `cargo nextest run --workspace`, the Vitest suite and `make check`. |
| `make build` | `install`, `data`, `cards` and `wasm`, then `pnpm build` into `web/build`. |
| `make verify` | `make build`, then `cookbook-cli verify-site web/build`. |
| `make test` | `make test-fast` and `make verify`, then the Playwright suite against `web/build`. |
| `make fmt` | Formats Rust with `cargo fmt` and the web code with Prettier. |
| `make lint` | `cargo fmt --check`, `cargo clippy -D warnings`, `svelte-check --fail-on-warnings`, Prettier and ESLint. |
| `make screenshots` | Builds the site and writes review screenshots into `SHOTS` (default `web/test-results/shots`). |
| `make walkthrough` | Records the how-to video and its captions with Playwright, then encodes `web/static/video/how-to-use.webm` and its poster offline in `FFMPEG_IMAGE` (any image with ffmpeg and a shell; the dev image has none). |
| `make preview` | Builds the production site with the GitHub Pages base path and serves it at http://localhost:5173/My_Cookbook/. |
| `make worker-deploy` | Deploys the AI Worker; needs `CLOUDFLARE_API_TOKEN`. `make worker-secrets` sets its secrets. |
| `make shell` | Opens a bash shell in the `dev` container. |
| `make ascii` | Fails on non-ASCII text outside accented letters, the degree sign and fraction glyphs. `make lint` runs it, and so does CI. |
| `make worker-build` | Builds the Cloudflare Worker without deploying it. |
| `make server` | Runs `cookbook-server` in the `dev` container on port 8080, serving `web/build`. |
| `make selfhost` | Builds and starts the `selfhost` service (`docker/server.Dockerfile`) on the host. |
| `make hooks` | Sets `core.hooksPath` to `.githooks`, enabling the pre-push hook. Runs on the host. |

## Conventions

### Commits

Commit messages follow `<type>(<scope>): <phrase>`, with a one-word scope and a short phrase in the imperative, and no trailers or co-author lines. For example:

```text
feat(core): add pan-size scaling
fix(admin): refuse to overwrite a newer recipe
content(recipes): add Pastizzi tal-Irkotta
docs(readme): rewrite the readme
```

Types in use include `feat`, `fix`, `content`, `docs`, `test`, `refactor`, `perf`, `ci`, `build` and `chore`. Recipe changes made from the in-site editor use `content(recipes): add|update|remove <title>`.

### Language

British English everywhere: user-facing copy, documentation, comments, test names and, where practical, identifiers (`colour`, `favourites`, `normalise`).

### Code

- Comments explain logic that is not obvious. History belongs in git, not in changelog or version comments.
- The core does no IO. Anything that reads files belongs in `cookbook-tree`, `cookbook-cli` or `cookbook-server`.
- `cargo clippy` runs with `-D warnings`, and `svelte-check` runs with `--fail-on-warnings`.

### CSS and design

- Use the tokens in `web/src/lib/styles/tokens.css` instead of repeated values; components never use raw colour values.
- No inline `style=` attributes and no dead selectors. Svelte's unused-selector warnings fail `make lint` and CI.
- Component styles are scoped in the component. One global sheet holds tokens, the reset, font faces and base typography.
- Icons come from `web/src/lib/components/Icon.svelte`; no emoji in the interface.
- The visual rules, the fonts and the banned fonts and colours are in [design-system/sapori/MASTER.md](../design-system/sapori/MASTER.md), with page overrides in `design-system/sapori/pages/`.

## Tests and budgets

| Tier | Command | What runs | Enforced budget |
|---|---|---|---|
| Fast | `make test-fast` | `cargo nextest run --workspace`, Vitest (`happy-dom`), the recipe checklist | A Rust test is marked slow at 5 s and killed at 10 s (`.config/nextest.toml`); a Vitest test times out at 2 s (`web/vite.config.ts`) |
| Full | `make test` | the fast tier, `make build`, `verify-site`, Playwright against the built site | The whole Playwright run fails past 90 s; each test has 15 s and each assertion 3 s (`web/playwright.config.ts`) |
| CI | `.github/workflows/ci.yml` | the same checks as parallel jobs | Each job has a timeout of 2 to 15 minutes |

The WebAssembly bundle has its own budget: `scripts/build-wasm.sh` fails if the gzipped module is over 200 KB.

Where each kind of test lives:

| Kind | Location | Runner |
|---|---|---|
| Rust unit tests | a `#[cfg(test)] mod tests` beside the code | cargo-nextest |
| Rust integration tests | `crates/cookbook-cli/tests/` and `crates/cookbook-server/tests/` | cargo-nextest |
| Web unit and component tests | `web/src/**/*.test.ts`, beside the module | Vitest |
| End-to-end tests | `web/e2e/*.spec.ts` | Playwright |

Rules for end-to-end tests:

- They run against the built site served by `web/scripts/serve-build.mjs`, never against the dev server.
- All network is mocked with `page.route` (for example `admin.json` and `https://api.github.com/**` in `admin.spec.ts`). No test may reach the internet.
- The sous-chef needs three fakes, as in `souschef.spec.ts`: Cloudflare Turnstile (`https://challenges.cloudflare.com/**`, a script that hands over a token at once), the Worker's `**/status` and its `**/chat` stream. Without the status fake the sous-chef reports that it cannot be reached.
- `walkthrough.spec.ts` records the how-to video and only runs under `make walkthrough`. Playwright's recordings carry no mouse pointer, so the spec draws one that glides to each control (`reach`, `tap`) and ripples on each press; move to a control with `tap` rather than `click` so the video can be followed.
- `smoke.spec.ts` runs once for every recipe in `web/static/data/manifest.json`, so a new recipe is covered without a new test.
- `mobile.spec.ts` runs in the Pixel 7 project, and `screenshots.spec.ts` only under `make screenshots`.

## Extending the code

### Adding a crate

1. Create `crates/<name>/` with a `Cargo.toml` that uses `edition.workspace = true`. The workspace includes every folder under `crates/` automatically.
2. Keep IO out of anything the web app or the Worker depends on, so that it still builds for `wasm32-unknown-unknown`.
3. If the crate feeds the WebAssembly bundle or the site data, add its path to `RUST_SRC` in the `Makefile`, so that `make wasm` and `make data` rebuild when it changes.
4. Add a `README.md` describing its purpose, public surface and tests.

CI runs clippy and nextest over the whole workspace, so a new crate is checked without changes to the workflow.

### Adding a component

1. Add the component under `web/src/lib/components/` (or `web/src/lib/components/admin/` for the editor).
2. Style it with scoped CSS using the design tokens, and take icons from `Icon.svelte`.
3. Read data through `RecipeSource` and `RecipeWriter` from `web/src/lib/data/`, never by fetching JSON directly, so the component works with both backends.
4. Call the core through `web/src/lib/core/` rather than importing the WASM bindings directly.
5. Add a Vitest test beside it, and an e2e test if it changes a user journey.

### Adding a check to the checklist

Add the rule to `crates/cookbook-core/src/checklist.rs` with a new `E-` or `W-` id and a unit test in the same file. The rule then runs in the editor, the CLI, CI and the server without further changes. If existing recipes fail it, fix them in the same change.

### Changing the recipe schema

Change the types in `crates/cookbook-core/src/schema.rs`, run `make types` to regenerate the TypeScript types, update [RECIPE_FORMAT.md](RECIPE_FORMAT.md), and run `make test-fast`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Files under `target/`, `web/node_modules` or `web/static` are owned by root | The image was built with other user ids, for example by `docker compose build` run directly, which defaults to 1000. Run `make image`, which passes the host's `HOST_UID` and `HOST_GID`. |
| `make dev` fails with a port already in use | Another process holds 5173 (or 8080 for `make server`). Stop it; Vite uses a strict port. |
| `the gzipped wasm is over the 200 KB budget` | A change pulled too much into `cookbook-wasm`. Keep heavy dependencies out of `cookbook-core` or behind features. |
| CI fails on `Generated types are up to date` | Run `make types` and commit `web/src/lib/types/recipe.ts`. |
| A recipe change does not show in `make dev` | Run `make data`; the dev server reads the built JSON. |
| `make lint` fails on Prettier in a fresh worktree | Run `make wasm data` first, so the generated files that the checks import exist, then `make fmt` to fix formatting. |
| A Rust test is killed after 10 s, or a Vitest test after 2 s | The test is over budget. Make it faster rather than raising the limit. |
| Playwright fails with `globalTimeout` | The whole e2e run went over 90 s. Look for a test waiting on an unmocked request. |
| The push to `main` is refused by the pre-push hook | `make test` failed. Fix the failure; the hook does not run for other branches. |
| Self-hosted sign-in does not stick over `http://localhost` | Set `COOKIE_SECURE=false` in `.env`. |
