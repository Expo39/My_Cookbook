# Sapori ta' l-kċina

Antonio's cookbook: a fast, static recipe site with scaling, unit conversion, cook mode, shareable recipe cards and a shopping list. Every recipe is one JSON file in this repository, and the folder tree gives the site's sections. A Rust core does the scaling, parsing, search and validation, both at build time and in the browser through WebAssembly. The site is built with SvelteKit and published on GitHub Pages.

## Quick start

Everything runs in Docker, so nothing is installed on the host beyond Docker and `make`.

```sh
make image       # build the dev image, once
make dev         # dev server on http://localhost:5173
make test-fast   # Rust, Vitest and the recipe checklist
make test        # everything, including Playwright against the built site
make check       # the recipe checklist alone
make build       # WebAssembly and the static site into web/build
make lint        # rustfmt, clippy, svelte-check, prettier and eslint
```

Run `make hooks` once per clone to refuse pushes to `main` unless `make test` passes.

## Adding a recipe

- With Claude Code, use the `add-recipe` skill. Paste the text, a link or a photo and it writes the JSON, runs the checklist and proposes a commit.
- In the site, open Settings and choose Unlock editing to use the admin editor.

Either way, `cookbook-cli check` has to pass before the recipe can go live.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): the crates, the data flow, the seams and the test tiers.
- [Recipe format](docs/RECIPE_FORMAT.md): the schema, the folder tree and the tokens.
- [Site settings](docs/CONFIGURATION.md): `cookbook.config.json` and the build variables.
- [Deployment](docs/DEPLOYMENT.md): GitHub Pages, the AI Worker and self-hosting.
- [Design system](design-system/sapori/MASTER.md): the visual rules.

## Layout

| Path | Contents |
|---|---|
| `recipes/` | the content |
| `crates/` | the Rust workspace |
| `web/` | the SvelteKit app |
| `docker/` | the dev and server images |
| `design-system/` | the design tokens and page rules |
| `docs/` | the documentation |
