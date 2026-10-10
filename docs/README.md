# Documentation

The documentation for Sapori ta' l-kċina. The [project README](../README.md) gives the overview and the quick start.

## Guides

| Document | Audience | Contents |
|---|---|---|
| [ADMIN.md](ADMIN.md) | Editors | Setting up and using the in-site editor: the token, unlocking, saving, moving, deleting and AI import |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Operators | GitHub Pages, the CI and deploy flow, the AI Worker, self-hosting and the server API |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Contributors | Prerequisites, `make` targets, conventions, tests and budgets, extending the code, troubleshooting |

## Reference

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, the build pipeline, the editor's save flow, the data seams, where the checklist runs, the security model |
| [RECIPE_FORMAT.md](RECIPE_FORMAT.md) | The recipe and section schema, the folder tree, step tokens and scaling rules |
| [CONFIGURATION.md](CONFIGURATION.md) | `cookbook.config.json` keys and build-time environment variables |
| [research/FEATURES.md](research/FEATURES.md) | Background research behind the feature set, including the rounding tables |

## Elsewhere in the repository

| Document | Contents |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How to propose a change |
| [design-system/sapori/MASTER.md](../design-system/sapori/MASTER.md) | The visual rules, with page overrides in `design-system/sapori/pages/` |
| [web/README.md](../web/README.md) | The SvelteKit app |
| [crates/cookbook-core](../crates/cookbook-core/README.md) | Schema, scaling, units, parser, search and checklist |
| [crates/cookbook-tree](../crates/cookbook-tree/README.md) | Loading the recipe tree from disc |
| [crates/cookbook-cli](../crates/cookbook-cli/README.md) | The command line tool and its subcommands |
| [crates/cookbook-wasm](../crates/cookbook-wasm/README.md) | The WebAssembly bindings |
| [crates/cookbook-ai](../crates/cookbook-ai/README.md) | Gemini prompts and request types |
| [crates/cookbook-worker](../crates/cookbook-worker/README.md) | The Cloudflare Worker |
| [crates/cookbook-server](../crates/cookbook-server/README.md) | The self-hosting server |
| [.claude/skills/add-recipe/SKILL.md](../.claude/skills/add-recipe/SKILL.md) | The `add-recipe` skill for Claude Code |
