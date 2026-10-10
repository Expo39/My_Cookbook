# Editing recipes from the site

Recipes can be added, changed and deleted from the site itself, without a checkout or a terminal. The editor commits straight to GitHub, so a change goes through the same checklist and CI as any other and reaches the site when the deploy finishes.

The other ways to add a recipe are the `add-recipe` Claude skill and editing the JSON files by hand. All three end in `cookbook-cli check`, so a recipe cannot go live unless every check passes.

## Setting it up (once)

Editing needs a GitHub token that is allowed to commit to this repository. The token is encrypted with a password that you choose and stored in the repository, so that any of your devices can unlock editing with the password alone.

1. Create a fine-grained token at **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - **Repository access:** only select repositories, then this repository and nothing else.
   - **Permissions → Repository permissions → Contents:** read and write. Leave the rest at no access. (Metadata: read-only is added automatically.)
   - **Expiration:** pick the longest you are comfortable with. When it lapses, replace it (see below).
2. On the site, open **Settings** (the sliders icon), then **Editing**. The set-up form appears when no editing key has been published yet.
3. Paste the token, choose a password of at least 12 characters, and repeat it. If the importer is set up (see below), paste its secret too. Press **Set up editing**.
4. The site checks that the token can write to the repository, encrypts it in the browser, and commits one file, `web/static/admin.json`. Editing is unlocked straight away on this device.

The new file reaches the site with the next deploy. Until then, other devices still show the set-up form.

If the repository is not `Expo39/My_Cookbook`, or the site is built from another branch, set `admin.repo` and `admin.branch` in `cookbook.config.json` (see `docs/CONFIGURATION.md`).

### What is stored, and the trade-off

`web/static/admin.json` is public, like everything else in the repository. It holds the token and the optional import secret, encrypted with AES-256-GCM under a key derived from your password with PBKDF2-SHA256 at 600,000 iterations. A random salt and nonce are made each time.

Anyone can download that file and try passwords against it on their own machine, with no limit on attempts and no rate limiting. The only defence is the password, which is why it needs at least 12 characters, and why a few unrelated words (a passphrase) work better than a short clever one. Someone who guesses it gets a token that can write to this one repository and nothing else. They could change recipes, and everything is in git history, so the damage can be undone.

Two things limit the exposure:

- The token is scoped to this repository and to Contents only. It cannot read other repositories, change settings or see secrets.
- Once unlocked, the token lives in memory and in `sessionStorage` for that tab. It is never written to `localStorage`, so closing the tab locks editing again.

If you think the password was guessed, revoke the token on GitHub straight away, create a new one and set up again. Deleting `web/static/admin.json` also removes the old copy from the site, though not from git history.

## Unlocking on another device

Open **Settings → Editing**, enter the password and press **Unlock editing**. The browser downloads `admin.json`, derives the key and decrypts the token locally. A wrong password gives a plain message and nothing else happens.

Settings → Editing also holds:

- **Lock editing**, which forgets the token at once.
- **Change the password**, which asks for the current password, re-encrypts the same token under the new one and commits the new file.
- **Replace the token or AI secret**, for when a token expires or is revoked. Leave a field blank to keep what is stored.

## The editor

**New recipe** in Settings opens a blank form. When editing is unlocked, every recipe page also has an **Edit** button. The editor is one static page at `/edit`, which asks for the password if editing is locked and is kept out of search engines and the search index.

The page has the details, where the recipe lives, a photo, ingredients, method, tips and related recipes, with a checklist and a live preview beside them. On a phone these are three tabs: Edit, Checks and Preview.

- **Where it lives.** Pick a section from the tree, or add a new subsection (inside the chosen section or at the top level). New sections are created in the same commit as the recipe. The web address follows the title until you edit it. Changing the section or the web address of an existing recipe moves it. The editor shows the old and new addresses, and one commit moves the file, renames its photo and points every recipe that listed it under related recipes at the new address. On the self-hosted server the same move is one request, followed by a save of any other edits.
- **Photo.** Upload a JPEG, PNG or WebP. It is scaled to at most 1600 px wide and re-encoded as a JPEG in the browser, which also drops location data. Alt text is required. A photo narrower than 1200 px gets a warning.
- **Ingredients.** Rows can be reordered by dragging or with the arrow buttons. **Paste ingredients** reads one ingredient per line with the same parser the site uses. Each row has a scaling mode, so salt can stay "to taste" and eggs stay whole.
- **Method.** **Insert** adds an ingredient amount, a temperature or a timer to a step as a token (`{@flour}`, `{temp:180}`, `{timer:25}`). `docs/RECIPE_FORMAT.md` lists them.
- **Variants** are kept exactly as they are but cannot be edited in the form. Change them in the recipe's JSON file.
- **Checklist.** The same checks as `cookbook-cli check`, run live in WebAssembly. Errors (crosses) switch Save off. Warnings are shown but allowed. Each line links to the field it is about.
- **Drafts.** The form is kept on this device a moment after every change, and offered back when you return. Leaving the page with unsaved changes asks first.

### Saving

**Save recipe** makes one commit to the configured branch containing the recipe, its photo and any new sections, then follows the build:

- **Building…** while CI and the deploy run. The run takes a few minutes, since CI runs the whole suite before the site is deployed.
- **Live** once the deploy has succeeded.
- **The build failed** with a link to the run on GitHub. The commit is already in git, so fix the problem there.

If someone else pushed meanwhile, the editor builds on the newest commit and tries again.

### Deleting

**Delete this recipe** first checks every other recipe, as stored on GitHub now (the deployed data plus the recipes changed in commits that have not deployed yet), not only as the live site shows them. If any still lists it under related recipes, deleting is blocked and they are named, each with a link to edit it. Otherwise you type the recipe's title to confirm. The recipe file and its photo are removed in one commit; git keeps the history.

## Importing a recipe with AI

When the site has an AI endpoint (`ai.endpoint` in `cookbook.config.json`, or the self-hosted server), a new recipe has **Import from text**. Paste any recipe text and the form is filled in for you to review. Nothing is saved by the import, and the checklist runs on the result like any other.

The importer is for the editor only. The Worker asks for a proof made from `ADMIN_IMPORT_SECRET`, so add that secret in the set-up form (or under Replace the token or AI secret). It is encrypted with the token. See `crates/cookbook-worker/README.md` for the Worker side. The free tier allows five imports per hour per address.

## Self-hosted mode

When the site is built with `PUBLIC_BACKEND=server` (see `docs/DEPLOYMENT.md`), there is no token and no `admin.json`. **Unlock editing** takes the server's admin password and sets a session cookie. The editor then saves, uploads and deletes through the server's API, which runs the same checklist before it writes a file. There is no build, so a change is live as soon as it is saved. Change the password with `ADMIN_PASSWORD_HASH` in the server's environment rather than from the site.
