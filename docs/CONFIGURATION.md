# Configuration

The cookbook is configured in two places: `cookbook.config.json` at the repository root, for site settings that belong in version control, and environment variables, for settings that depend on where and how the site is built. Both are read at build time, so a change goes live with the next deploy.

The self-hosted server's runtime variables are listed in [DEPLOYMENT.md](DEPLOYMENT.md#configuration), and the Worker's in [crates/cookbook-worker/README.md](../crates/cookbook-worker/README.md#configuration).

## `cookbook.config.json`

Every key is optional. A missing key, or a file that cannot be read, means the default, and an optional feature is then off. The file is read by the web build (`web/vite.config.ts`) and by `cookbook-cli`.

```json
{
  "site": { "url": "https://expo39.github.io", "basePath": "/My_Cookbook" },
  "ai": {
    "endpoint": "https://sous-chef.example.workers.dev",
    "turnstileSiteKey": "0x4AAAAAAA-example"
  },
  "admin": { "repo": "Expo39/My_Cookbook", "branch": "main" },
  "social": {
    "instagram": { "enabled": true, "handle": "tonys_foods" }
  }
}
```

The `ai` and `admin` blocks above are examples; the committed file sets only `site` and `social`.

| Key | Type | Default | Effect |
|---|---|---|---|
| `site.url` | string | `https://expo39.github.io` | The deployed origin: canonical and Open Graph addresses, and the address in each share card's QR code. `PUBLIC_SITE_URL` overrides it. |
| `site.basePath` | string | empty | The path the site is served under, used by `cookbook-cli cards` while `PUBLIC_SITE_URL` is not set. Once it is set, the cards take `BASE_PATH` from the environment instead, as the web build always does. |
| `ai.endpoint` | string | none | The URL of the AI Worker. Without one (and without the self-hosted backend) the sous-chef and the importer are hidden. `PUBLIC_AI_ENDPOINT` overrides it. |
| `ai.turnstileSiteKey` | string | none | The public Cloudflare Turnstile site key. With one, the sous-chef gets a person check before each question; the Worker enforces it once `TURNSTILE_SECRET` is set. `PUBLIC_TURNSTILE_SITE_KEY` overrides it. |
| `admin.repo` | string | `Expo39/My_Cookbook` | The `owner/name` repository that the in-site editor commits to. See [ADMIN.md](ADMIN.md). |
| `admin.branch` | string | `main` | The branch the editor commits to, which should be the branch the site is deployed from. |
| `social.instagram.enabled` | boolean | `false` | Shows "More recipes on Instagram @handle" in the footer and links the profile from each recipe's structured data (`author.sameAs`). |
| `social.instagram.handle` | string | none | The Instagram username, with or without `@`. A handle that is not 1-30 letters, digits, dots or underscores leaves the link off. |

## Build-time environment variables

These are read when the site or its data is built. The values are baked into the output, so changing one needs a rebuild.

| Variable | Read by | Default | Effect |
|---|---|---|---|
| `PUBLIC_BACKEND` | web build | `static` | Selects the data source and the editor's writer: `static` reads the built JSON and commits through GitHub; `server` (or its alias `api`) uses the self-hosted server's API. Any other value fails the build. |
| `PUBLIC_SITE_URL` | web build, `cookbook-cli cards` | `site.url` | The deployed origin, overriding `site.url`. |
| `PUBLIC_AI_ENDPOINT` | web build | `ai.endpoint` | The AI Worker's URL, overriding `ai.endpoint`. |
| `PUBLIC_TURNSTILE_SITE_KEY` | web build | `ai.turnstileSiteKey` | The Turnstile site key, overriding `ai.turnstileSiteKey`. |
| `BASE_PATH` | web build, `cookbook-cli cards`, e2e | empty | The path prefix the site is served under, for example `/My_Cookbook` on GitHub Pages and empty when self-hosted. CI sets it in `.github/workflows/ci.yml`. |
| `SOURCE_DATE_EPOCH` | `cookbook-cli build` | the current time | Fixes the build timestamp written by `build`, for reproducible output. |

The `dev` service in `docker-compose.yml` passes `BASE_PATH`, `PUBLIC_BACKEND`, `PUBLIC_SITE_URL`, `PUBLIC_AI_ENDPOINT` and `GITHUB_SHA` through from the host, so `BASE_PATH=/My_Cookbook make build` and `PUBLIC_BACKEND=server make build` work as written. The server image (`docker/server.Dockerfile`) sets `PUBLIC_BACKEND=server` and `BASE_PATH=""` itself.

## Test and tooling variables

| Variable | Read by | Effect |
|---|---|---|
| `E2E_PREBUILT` | `web/playwright.config.ts` | Serve the existing `web/build` with `web/scripts/serve-build.mjs` instead of building first. `make test` and CI set it. |
| `FULL_E2E` | `web/playwright.config.ts` | Adds the mobile WebKit project (iPhone 14) to the mobile spec. |
| `SCREENSHOTS` | `web/playwright.config.ts` | Runs only the screenshot spec. `make screenshots` sets it. |
| `SHOTS_DIR` | `web/e2e/screenshots.spec.ts` | Where the screenshot spec writes; defaults to `test-results/shots`. |
| `CI` | `web/playwright.config.ts` | Forbids `test.only` and uses the GitHub reporter. |
| `BUILD_DIR`, `PORT` | `web/scripts/serve-build.mjs` | The folder to serve (default `build`) and the port (default `4173`). |
| `SHOTS` | `Makefile` | The host folder for `make screenshots`; defaults to `web/test-results/shots`. |
