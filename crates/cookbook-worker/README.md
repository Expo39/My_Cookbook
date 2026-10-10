# cookbook-worker

A Cloudflare Worker, written in Rust with `workers-rs`, that proxies the sous-chef chat and the recipe importer to Gemini. The Gemini key lives only in the Worker's secrets, so it never reaches the browser. The prompts, request types and error messages come from `cookbook-ai`, so the Worker and the self-hosted server behave the same.

The static site uses the Worker when `ai.endpoint` in `cookbook.config.json` (or `PUBLIC_AI_ENDPOINT`) points at it. See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md#the-ai-proxy-cloudflare-worker) for where it fits in a deployment.

## Routes

| route | auth | body | success |
|---|---|---|---|
| `POST /chat` | none (per-IP limit) | `{ recipeId, history, question }`, at most 32 KB; a `recipe` in the body is ignored | `{ reply, truncated }` |
| `POST /import` | `X-Admin-Proof` header | `{ text }`, at most 20 KB | `{ recipe, checks }` |
| `OPTIONS *` | none | none | 204 with the CORS headers |

Errors are always `{ error, message }`, where `message` is fit to show to a cook. Rate limits reply 429 with a `Retry-After` header. Limits default to 30 chat requests and 5 imports per IP per hour (`RATE_LIMIT_CHAT`, `RATE_LIMIT_IMPORT`), counted as a fixed window in Workers KV. The Rate Limiting binding is not exposed by workers-rs yet.

## Configuration

| name | kind | notes |
|---|---|---|
| `SITE_URL` | var | the deployed site's address including its base path, e.g. `https://expo39.github.io/My_Cookbook`. `/chat` fetches `<SITE_URL>/data/recipes/<recipeId>.json` itself, so the sous-chef only ever discusses published recipes |
| `ALLOWED_ORIGINS` | var | comma-separated, e.g. `https://expo39.github.io,http://localhost:5173` |
| `GEMINI_MODEL` | var | defaults to the model compiled into `cookbook-ai` |
| `GEMINI_API_KEY` | secret | Google AI Studio key |
| `ADMIN_IMPORT_SECRET` | secret | keys the admin proof, see below |
| `RATE_LIMIT` | KV binding | created by the first deploy |

No account id is committed. Wrangler takes it from `CLOUDFLARE_ACCOUNT_ID` or from the login.

## Deploying

Everything runs in the dev container, so nothing is installed on the host:

```sh
docker compose run --rm dev npx wrangler login
docker compose run --rm dev sh -c 'cd crates/cookbook-worker && npx wrangler deploy'
docker compose run --rm dev sh -c 'cd crates/cookbook-worker && npx wrangler secret put GEMINI_API_KEY'
docker compose run --rm dev sh -c 'cd crates/cookbook-worker && npx wrangler secret put ADMIN_IMPORT_SECRET'
```

`make worker-build` builds the Worker without deploying. Point the site at the deployed URL with `PUBLIC_AI_ENDPOINT`.

## The admin proof for `/import`

Importing spends quota and is for the editor only, so `/import` needs `X-Admin-Proof: <unix milliseconds>.<hex>`, where `<hex>` is the HMAC-SHA256 of the timestamp string, keyed with `ADMIN_IMPORT_SECRET`. A proof is valid for 5 minutes (and may be stamped up to 30 seconds ahead of the Worker's clock).

The admin UI gets the secret from the same place as the GitHub token: the secret is stored encrypted in the same blob, so unlocking editing with the passphrase unlocks both. The UI signs a fresh timestamp for each import with Web Crypto (`HMAC`, `SHA-256`). Only the verification is implemented here.

Generate the secret with `openssl rand -hex 32`.

## Layout

| Module | Role |
|---|---|
| `src/lib.rs` | the entry point; the request rules are pure functions in the modules below |
| `src/handler.rs` | the thin Workers glue: routing, the Gemini call and the site fetch |
| `src/auth.rs` | the admin proof check |
| `src/cors.rs` | `ALLOWED_ORIGINS` and the CORS headers |
| `src/limits.rs` | the per-IP fixed-window limits in Workers KV |

## Tests

The pure modules have unit tests that run natively with the rest of the workspace. CI also builds the crate for `wasm32-unknown-unknown`, the target Workers run.

```sh
cargo nextest run -p cookbook-worker
make worker-build
```
