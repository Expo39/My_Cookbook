# Site settings

Optional features are switched on in `cookbook.config.json` at the repo root. Anything missing, or a file that cannot be read, means the feature is off. The file is read at build time, so a change goes live with the next deploy.

```json
{
  "site": { "url": "https://expo39.github.io", "basePath": "/My_Cookbook" },
  "ai": { "endpoint": "https://sous-chef.example.workers.dev" },
  "social": {
    "instagram": { "enabled": true, "handle": "tonys_foods" }
  }
}
```

| Setting | Default | Effect |
|---|---|---|
| `site.url` | `https://expo39.github.io` | The deployed origin: canonical and Open Graph addresses, and the address in each share card's QR code. `PUBLIC_SITE_URL` overrides it. |
| `site.basePath` | empty | The path the site is served under. The cards use it only while `PUBLIC_SITE_URL` is not set; once it is, they take `BASE_PATH` from the environment instead, as the web build does. |
| `ai.endpoint` | none | The sous-chef Worker. Without one (and without the self-hosted backend) the "Ask the sous-chef" button is not shown. `PUBLIC_AI_ENDPOINT` overrides it. |
| `social.instagram.enabled` | `false` | Shows "More recipes on Instagram @handle" in the footer and links the profile from each recipe's structured data (`author.sameAs`). |
| `social.instagram.handle` | none | The Instagram username, with or without `@`. An invalid username leaves the link off. |

Build-time environment variables (`PUBLIC_BACKEND`, `PUBLIC_SITE_URL`, `PUBLIC_AI_ENDPOINT`, `BASE_PATH`) are covered in `docs/DEPLOYMENT.md`.
