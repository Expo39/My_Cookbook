# Contributing

This page describes how a change reaches `main`. The toolchain, conventions and tests are covered in more depth in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Workflow

1. Create a branch from `main`. Work never happens on `main` directly.
2. Make the change in small, logical commits.
3. Run the checks below locally.
4. Open a pull request into `main` that explains what changed and why.
5. CI runs on the pull request. The **CI passed** check must be green before the pull request can be merged.
6. Once merged, the push to `main` runs CI again and then deploys the site.

Run `make hooks` once per clone. The pre-push hook then runs `make test` before any push to `main`.

## Commit messages

Use `<type>(<scope>): <phrase>`, with a one-word scope and an imperative phrase. Do not add trailers or co-author lines.

```text
feat(core): add pan-size scaling
fix(admin): refuse to overwrite a newer recipe
content(recipes): add Pastizzi tal-Irkotta
```

## Checks to run

| Change | Run |
|---|---|
| Any code | `make lint` and `make test-fast` |
| User journeys, routing or the build | `make test` |
| A recipe | `make check` (or let the `add-recipe` skill run it) |
| The recipe schema | `make types`, then `make test-fast` |
| Documentation only | Nothing; CI skips the build for docs-only changes |

## Style

- British English in copy, documentation, comments and test names.
- CSS uses the design tokens, with no inline styles and no dead selectors. See [design-system/sapori/MASTER.md](design-system/sapori/MASTER.md).
- Comments only where the logic is not obvious.
- Tests stay within their time budgets, and end-to-end tests mock all network.

## Adding recipes

Recipes follow [docs/RECIPE_FORMAT.md](docs/RECIPE_FORMAT.md) and must pass the recipe checklist. They can be added with the in-site editor ([docs/ADMIN.md](docs/ADMIN.md)), the `add-recipe` skill, or by hand.
