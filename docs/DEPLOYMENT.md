# Deployment

GitHub Pages is the main way to publish the cookbook. Self-hosting is the fallback for the day the site leaves Pages: the same web app talks to an Axum server instead of reading static files.

## GitHub Pages

The site goes live from `main` only. Work happens on other branches, which CI does not run on.

1. In the repository's **Settings → Pages**, set the source to **GitHub Actions**.
2. CI (`.github/workflows/ci.yml`) runs on pull requests into `main` and on pushes to `main`. Its last job, **CI passed**, fails if any other job failed.
3. Deploy (`.github/workflows/deploy.yml`) runs only after CI succeeds on a push to `main`, so a failing test or checklist never ships.

### Nothing reaches `main` until everything passes

- **Locally:** run `make hooks` once per clone. The pre-push hook then runs `make test` before any push to `main` and refuses the push if anything fails. Other branches push without it.
- **On GitHub:** in **Settings → Rules → Rulesets**, add a branch ruleset targeting `main` with **Require a pull request before merging** and **Require status checks to pass**, adding the **CI passed** check. Turn on **Block force pushes**. A change then reaches `main` only through a pull request whose CI is green.

## The AI proxy (Cloudflare Worker)

The static site cannot hold the Gemini key, so the sous-chef and the importer go through `crates/cookbook-worker`. Deployment, secrets and the admin proof are covered in `crates/cookbook-worker/README.md`. Point the site at it with `PUBLIC_AI_ENDPOINT`.

## Self-hosting

### What you get

`crates/cookbook-server` serves the built site and a JSON API with the same shapes as the static build (`cookbook_core::site`). It also lets the editor save recipes, add sections and upload images behind a password, and it calls Gemini itself, so no Worker is needed. Build the site with `PUBLIC_BACKEND=server` and `BASE_PATH=""`; the Dockerfile does both.

### Setting up

1. Copy `.env.example` to `.env`.
2. Create the password hash and paste it into `ADMIN_PASSWORD_HASH`, in single quotes:
   ```sh
   printf '%s' 'your password' | docker compose run --rm -T dev cargo run -q -p cookbook-server -- --hash-password
   ```
3. Set `SESSION_SECRET` (`openssl rand -hex 32`) and, if wanted, `GEMINI_API_KEY`.
4. Start it with `make selfhost`. The site is then at `http://localhost:8080`. Over plain HTTP set `COOKIE_SECURE=false`, otherwise the browser will not keep the session cookie.

`recipes/` is a bind mount, so edits land in your working copy. To commit each edit as well, set `GIT_COMMIT=true` and mount `./.git` (see `docker-compose.yml`); the git identity of the repository is used.

For development without the image, `make server` runs the server in the dev container on port 8080, serving `web/build`.

### Configuration

| variable | default | meaning |
|---|---|---|
| `COOKBOOK_ROOT` | `.` | the repository folder that contains `recipes/` |
| `WEB_DIR` | none | the built site; without it only the API is served |
| `ADMIN_PASSWORD_HASH` | required | argon2id hash from `--hash-password` |
| `SESSION_SECRET` | required | at least 32 characters; changing it signs everyone out |
| `GEMINI_API_KEY` | none | switches the AI endpoints on |
| `GEMINI_MODEL` | `gemini-3.8-flash` | any `generateContent` model id |
| `GEMINI_TEMPERATURE`, `GEMINI_MAX_OUTPUT_TOKENS` | `0.4`, `1024` | optional tuning |
| `BIND` | `0.0.0.0:8080` | listen address |
| `GIT_COMMIT` | `false` | commit each change with git |
| `COOKIE_SECURE` | `true` | the `Secure` flag on the session cookie |
| `TRUST_PROXY` | `false` | take the client address from the last `X-Forwarded-For` entry; only behind a proxy you control |

### HTTPS

Put Caddy in front. `docker/Caddyfile.example` is a complete configuration: replace the host name, run Caddy on the same compose network, and keep `COOKIE_SECURE=true` and `TRUST_PROXY=true`.

### API

| method and path | session | purpose |
|---|---|---|
| `GET /api/index` | no | `SiteIndex` |
| `GET /api/recipes/{id}` | no | `RecipeData`; the `ETag` header is the quoted SHA-256 of the file |
| `GET /api/search?q=` | no | `SearchHit[]`; `?have=eggs,rice` gives `Coverage[]` |
| `GET /api/search-index` | no | the `SearchIndex` that `search.json` holds |
| `GET /api/images/{folder}/{file}` | no | an image from `recipes/` |
| `GET /api/session` | no | `{ authenticated }` |
| `POST /api/session` | no | `{ password }`; sets the cookie (5 failed attempts per 15 minutes per address) |
| `DELETE /api/session` | no | clears the cookie |
| `PUT /api/recipes/{id}` | yes | saves a `Recipe`; 422 with the checklist on errors; `If-Match` or `If-None-Match: *` give 412 `conflict` when the file differs, is missing or already exists; the new `ETag` is returned |
| `DELETE /api/recipes/{id}` | yes | 409 with the linking recipes if any remain; `If-Match` works as for PUT |
| `POST /api/recipes/{id}/move` | yes | `{ to }`; needs `If-Match` (428 without). Moves the file and its photo, rewrites `related` in other recipes, makes one commit. 404, 409 `exists`, 412 `conflict`, 422 `invalid` or `section_missing`, 400 `bad_request`; returns `{ id }` and the new `ETag` |
| `POST /api/sections` | yes | `{ path, title, order?, summary? }` |
| `POST /api/images/{id}` | yes | multipart, JPEG, PNG, WebP or GIF up to 8 MB; saved next to the recipe |
| `POST /api/ai/chat` | no | as the Worker's `/chat`; 30 per hour per address |
| `POST /api/ai/import` | yes | as the Worker's `/import`; 5 per hour per address |

Errors are `{ error, message }`; checklist failures add `results`.
