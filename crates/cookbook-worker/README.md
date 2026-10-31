# cookbook-worker

A Cloudflare Worker, written in Rust with `workers-rs`, that proxies the sous-chef chat and the recipe importer to Gemini. The Gemini key lives only in the Worker's secrets, so it never reaches the browser. The prompts, request types and error messages come from `cookbook-ai`, so the Worker and the self-hosted server behave the same.

The static site uses the Worker when `ai.endpoint` in `cookbook.config.json` (or `PUBLIC_AI_ENDPOINT`) points at it. See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md#the-ai-proxy-cloudflare-worker) for where it fits in a deployment.

## Routes

| route | auth | body | success |
|---|---|---|---|
| `POST /chat` | per-IP limit, and a Turnstile token when `TURNSTILE_SECRET` is set | `{ recipeId, history, question, recipe? }`, at most 32 KB; `recipe` is read only when the site has no recipe at `recipeId` | a `text/event-stream`, started at once: a `status` event `{ state: "fallback" }` when the main model is busy, retired or out of quota and `GEMINI_FALLBACK_MODEL` is asked instead, a `model` event `{ model, fallback }` naming the model that answers, `delta` events `{ text }`, then `done` `{ truncated }`, or an `error` event `{ error, message }` |
| `GET /status` | none | nothing | `{ gemini: "ok" \| "busy", retired: string \| null }`: "busy" for two minutes after every model stayed busy, and `retired` names a model Gemini no longer offers, for a day after it was last refused, which the site shows to the owner. It never calls Gemini; the site asks it when the sous-chef opens, and treats no answer as the Worker being unreachable |
| `POST /import` | `X-Admin-Proof` header | `{ text }`, at most 20 KB | `{ recipe, checks }` |
| `OPTIONS *` | none | none | 204 with the CORS headers |

Errors before the answer starts are always `{ error, message }` with an error status, where `message` is fit to show to a cook; an answer that breaks off part way ends with an `error` event of the same shape. `/chat` and `/import` answer only a request whose `Origin` is in `ALLOWED_ORIGINS`, and refuse any other with 403 `forbidden_origin`; `/status` is open to all. Rate limits reply 429 with a `Retry-After` header. They are counted by Cloudflare's rate limiter (`PER_VISITOR` and `EVERYONE` below), which keeps its counts without any KV writes, so a flood of requests cannot use up the KV quota.

## Configuration

| name | kind | notes |
|---|---|---|
| `SITE_URL` | var | the deployed site's address including its base path, e.g. `https://expo39.github.io/My_Cookbook`. `/chat` fetches `<SITE_URL>/data/recipes/<recipeId>.json` itself, so a published recipe is never taken from the request |
| `ALLOWED_ORIGINS` | var | comma-separated, e.g. `https://expo39.github.io,http://localhost:5173` |
| `GEMINI_MODEL` | var | defaults to the model compiled into `cookbook-ai` |
| `GEMINI_THINKING_LEVEL` | var | `low` by default; `minimal`, `medium`, `high`, or `default` to send none |
| `GEMINI_FALLBACK_MODEL` | var | optional; takes over when the main model is busy three times, out of quota, retired or silent for 25 s (`gemini-flash-lite-latest` here) |
| `TURNSTILE_SECRET` | secret | optional; when set, `/chat` needs an `X-Turnstile-Token` header |
| `GEMINI_API_KEY` | secret | Google AI Studio key |
| `ADMIN_IMPORT_SECRET` | secret | keys the admin proof, see below |
| `RATE_LIMIT` | KV binding | short notes (the AI is busy, a model was retired); created by the first deploy |
| `PER_VISITOR`, `EVERYONE` | rate limiters | 4 a minute per IP address and 20 a minute in all, for `/chat` and `/import` |

No account id is committed. Wrangler takes it from `CLOUDFLARE_ACCOUNT_ID` or from the login.

## Deploying

Everything runs in the dev container, so nothing is installed on the host. `wrangler login` cannot complete its browser callback inside the container, so deploys authenticate with an API token instead:

1. In the Cloudflare dashboard, create an API token from the **Edit Cloudflare Workers** template (**My Profile > API Tokens > Create Token**).
2. Export it in the shell, together with the account id if the token covers more than one account:

   ```sh
   export CLOUDFLARE_API_TOKEN=...
   export CLOUDFLARE_ACCOUNT_ID=...   # optional
   ```

3. Deploy, then set the secrets. `make worker-secrets` prompts for the Gemini key, so it never appears in the shell history, then generates `ADMIN_IMPORT_SECRET` and prints it once to keep:

   ```sh
   make worker-deploy
   make worker-secrets
   ```

   `make worker-deploy` prints the Worker's URL, e.g. `https://sapori-ai.<subdomain>.workers.dev`. The first deploy also creates the `RATE_LIMIT` KV namespace.

4. Point the site at it with `ai.endpoint` in `cookbook.config.json` (or `PUBLIC_AI_ENDPOINT`), and add the site's origin to `ALLOWED_ORIGINS` if it is not already listed.

`make worker-build` builds the Worker without deploying. Point the site at the deployed URL with `PUBLIC_AI_ENDPOINT`.

## The admin proof for `/import`

Importing spends quota and is for the editor only, so `/import` needs `X-Admin-Proof: <unix milliseconds>.<hex>`, where `<hex>` is the HMAC-SHA256 of the timestamp string, keyed with `ADMIN_IMPORT_SECRET`. A proof is valid for 5 minutes (and may be stamped up to 30 seconds ahead of the Worker's clock).

The admin UI gets the secret from the same place as the GitHub token: the secret is stored encrypted in the same blob, so unlocking editing with the passphrase unlocks both. The UI signs a fresh timestamp for each import with Web Crypto (`HMAC`, `SHA-256`). Only the verification is implemented here.

`make worker-secrets` generates the secret; any random 32-byte hex string works if it is set by hand.

## Layout

| Module | Role |
|---|---|
| `src/lib.rs` | the entry point; the request rules are pure functions in the modules below |
| `src/handler.rs` | the thin Workers glue: routing, the Gemini call and the site fetch |
| `src/auth.rs` | the admin proof check |
| `src/cors.rs` | `ALLOWED_ORIGINS` and the CORS headers |
| `src/limits.rs` | the keys for the per-visitor and site-wide rate limiters |

## Tests

The pure modules have unit tests that run natively with the rest of the workspace. CI also builds the crate for `wasm32-unknown-unknown`, the target Workers run.

```sh
cargo nextest run -p cookbook-worker
make worker-build
```
