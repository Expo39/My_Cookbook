# Site settings

Optional features are switched on in `cookbook.config.json` at the repo root. Anything missing, or a file that cannot be read, means the feature is off. The file is read at build time, so a change goes live with the next deploy.

```json
{
  "social": {
    "instagram": { "enabled": true, "handle": "tonys_foods" }
  }
}
```

| Setting | Default | Effect |
|---|---|---|
| `social.instagram.enabled` | `false` | Shows "More recipes on Instagram @handle" in the footer and links the profile from each recipe's structured data (`author.sameAs`). |
| `social.instagram.handle` | none | The Instagram username, with or without `@`. An invalid username leaves the link off. |

Build-time environment variables (`PUBLIC_BACKEND`, `PUBLIC_SITE_URL`, `PUBLIC_AI_ENDPOINT`, `BASE_PATH`) are covered in `docs/DEPLOYMENT.md`.
