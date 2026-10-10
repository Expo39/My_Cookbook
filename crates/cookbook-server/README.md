# cookbook-server

An Axum server for hosting the cookbook without GitHub Pages. It serves the built site and a JSON API with the same shapes as the static build, lets the in-site editor write to the `recipes/` tree behind a password, and calls Gemini itself for the sous-chef and the importer.

The web app talks to it when built with `PUBLIC_BACKEND=server`. Set-up, configuration, HTTPS and the API reference are in [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md#self-hosting).

## Running

```sh
make server      # in the dev container, serving web/build on port 8080
make selfhost    # the production image (docker/server.Dockerfile) with Docker Compose
```

The binary also has two utility modes:

| Flag | Purpose |
|---|---|
| `--hash-password` | reads a password from standard input and prints its argon2id hash for `ADMIN_PASSWORD_HASH` |
| `--healthcheck` | exits successfully when the running server answers; used by the image's `HEALTHCHECK` |

## Behaviour

- Reads use the same loader (`cookbook-tree`) and data shapes (`cookbook_core::site`) as the static build.
- Every write runs the recipe checklist first and is refused with the results if there are errors.
- Deleting a recipe is refused while other recipes still link to it.
- A save of a recipe that changed after the editor opened it is refused, and nothing is written.
- With `GIT_COMMIT=true`, each change is also committed with git.
- Sign-in is limited to 5 failed attempts per 15 minutes per address, and the AI routes to 30 chats and 5 imports per hour per address.

## Layout

| Module | Role |
|---|---|
| `src/main.rs` | start-up, `--hash-password` and `--healthcheck` |
| `src/lib.rs` | the router |
| `src/api.rs` | the recipe, section, image, search and session handlers |
| `src/ai.rs` | `/api/ai/chat` and `/api/ai/import` |
| `src/auth.rs` | the password check, the signed session cookie and the attempt limiter |
| `src/config.rs` | the environment variables |
| `src/state.rs` | shared state and the rate limiters |
| `src/files.rs` | serving the built site, with the app shell as the fallback for client-side routes |
| `src/ids.rs` | validation of ids and paths that reach the file system |

## Tests

Unit tests sit beside the code, and `tests/api.rs` exercises the API end to end against a temporary recipe tree.

```sh
cargo nextest run -p cookbook-server
```
