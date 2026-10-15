# Editing recipes from the site

Anyone can add recipes of their own from the site. Those recipes are kept in the visitor's browser and belong to them: they can change or delete them, and nobody else sees them. The cookbook's published recipes belong to its owner and can only be changed by whoever holds the GitHub token.

With the token unlocked, recipes can be added, changed, moved and deleted in the cookbook itself, without a checkout or a terminal. On GitHub Pages the editor commits straight to the repository, so every change goes through the same checklist and CI as any other and reaches the site when the deploy finishes. On a self-hosted server the editor writes through the server's API instead.

The other ways to add a recipe are the `add-recipe` skill for Claude Code and editing the JSON files by hand (see [RECIPE_FORMAT.md](RECIPE_FORMAT.md)). All of them end in the same recipe checklist, so a recipe cannot go live unless every check passes.

## Contents

- [Recipes on this device](#recipes-on-this-device)
- [Sharing a recipe with everyone](#sharing-a-recipe-with-everyone)
- [Editing states](#editing-states)
- [Setting up editing](#setting-up-editing)
- [Unlocking on another device](#unlocking-on-another-device)
- [Changing the password or the token](#changing-the-password-or-the-token)
- [The editor](#the-editor)
- [Saving and the build status](#saving-and-the-build-status)
- [Moving a recipe](#moving-a-recipe)
- [Conflict protection](#conflict-protection)
- [Deleting a recipe](#deleting-a-recipe)
- [Importing a recipe with AI](#importing-a-recipe-with-ai)
- [Self-hosted mode](#self-hosted-mode)

## Recipes on this device

**Add a recipe** (on the home page, on a section page, and in **Settings > Your recipes**) opens the editor at `/edit` without any token. A recipe saved there goes to the browser's IndexedDB, not to GitHub, and appears on the home page under "Your recipes" and in its section, marked "Yours". It opens at `/mine?id=<id>`, which shows it with every feature of a published recipe (scaling, units, timers, cook mode, the shopping list and the sous-chef) and a note that it is kept in this browser only.

The editor is simpler in this mode, so that someone who has never seen a recipe file can fill it in:

- A short introduction says that a title, the ingredients and the method are all a recipe needs.
- **Paste a list** leads the ingredients: one ingredient per line, read with the same parser the site uses. Each row shows the amount, unit, ingredient and note, with **Optional ingredient** and **To taste, no amount** as tick boxes; "Up to", "Before the amount", the scaling mode and the key are under **More options**, and a group's total is under **Group total (optional)**.
- The method is written in plain words. "Bake for 25 minutes at 200C" is saved as `Bake for {timer:25} at {temp:200}`, so the cook gets a timer and a converted temperature, and the editor lists what it found under each step. Hours and minutes, ranges ("20-25 minutes"), seconds, Fahrenheit and fan temperatures ("180°C (160°C fan)") are recognised. When the recipe is opened again the tokens are shown as the same words. **Insert** still adds ingredient references and named timers.
- The local name, what a serving is called, the difficulty, tags, tips and related recipes are under **More details (optional)**.
- The web address follows the title and is not shown, new sections cannot be created, and photos and the AI import are not offered; all of these belong to the cookbook.
- The checklist pane is called **To do**.

**Settings > Your recipes** counts the recipes on the device and has **Export** (a JSON file of them all), **Import** (reads such a file back; a file with any broken recipe is refused whole) and **Clear all personal recipes**, which asks first and names how many will be deleted. The browser is asked to keep the site's storage, but clearing the site's data deletes the recipes, so exporting a copy is worthwhile.

## Sharing a recipe with everyone

Each recipe in **Settings > Your recipes** has **Share with everyone**. Sharing needs the GitHub token: while editing is locked, the button points at the **Sharing to GitHub** panel below it, where the token is set up or unlocked as described in the rest of this guide.

Once unlocked, **Share with everyone** asks for confirmation, then commits the recipe to `recipes/<id>.json` on the configured branch (`content(recipes): add <title>`), exactly as the token holder's editor would. From then on the recipe is the cookbook's: the copy on the device is marked as shared and locks, and the cookbook's copy appears after the next deploy. When the deployed index carries the recipe, the shared copy is removed from the device the next time the site loads. A commit that touches only `recipes/` takes CI's fast path (see [DEPLOYMENT.md](DEPLOYMENT.md#the-fast-path)), so it is live in a few minutes.

## Editing states

Editing is controlled from **Settings** (the sliders icon), under **Sharing to GitHub (optional)**. What that panel shows depends on whether editing has been set up for the site and whether it is unlocked in the current tab.

```mermaid
stateDiagram-v2
    [*] --> NotSetUp: no admin.json on the deployed site
    [*] --> Locked: admin.json is published
    NotSetUp --> Unlocked: Set up editing (token and password)
    Locked --> Unlocked: Unlock editing (password)
    Unlocked --> Locked: Lock editing, or the tab is closed
    Unlocked --> Unlocked: Change the password, or replace the token or AI secret
    Unlocked --> [*]
```

| State | What the Sharing to GitHub panel shows |
|---|---|
| Not set up | The set-up form: GitHub token, password, repeated password and an optional AI import secret |
| Locked | A password field and **Unlock editing** |
| Unlocked | **New recipe**, **Lock editing**, **Change the password** and **Replace the token or AI secret** |

The token is kept for the current tab only, so closing the tab, or **Lock editing**, returns to the locked state.

## Setting up editing

Editing needs a GitHub token that can commit to the repository. The token is encrypted in the browser with a password and committed to the repository as `web/static/admin.json`, so that any device can unlock editing with the password alone. This is done once per site.

### 1. Create a fine-grained token

1. On GitHub, open **Settings > Developer settings > Personal access tokens > Fine-grained tokens** and choose **Generate new token**.
2. Give it a name, for example "Cookbook editor".
3. **Resource owner:** the account or organisation that owns the repository.
4. **Expiration:** the longest period that is acceptable. When the token expires, replace it (see [Changing the password or the token](#changing-the-password-or-the-token)).
5. **Repository access:** **Only select repositories**, then the cookbook repository and nothing else.
6. **Permissions > Repository permissions > Contents:** **Read and write**. Leave every other permission at **No access**. **Metadata: Read-only** is added automatically.
7. Generate the token and copy it. GitHub shows it only once.

### 2. Set up editing on the site

1. Open **Settings > Sharing to GitHub**. The set-up form appears while no editing key has been published.
2. Paste the token into **GitHub token**.
3. Choose a password of at least 12 characters and repeat it. A passphrase of several unrelated words is stronger than a short, complex password.
4. If the AI importer is deployed, paste its secret into **AI import secret** (see [Importing a recipe with AI](#importing-a-recipe-with-ai)). It can be added later.
5. Press **Set up editing**.

The site checks that the token can push to the repository, encrypts the token (and the import secret) in the browser, and commits `web/static/admin.json` to the configured branch. Editing is unlocked straight away on that device. Other devices see the set-up form until the commit has been deployed.

If the repository is not `Expo39/My_Cookbook`, or the site is deployed from a branch other than `main`, set `admin.repo` and `admin.branch` in `cookbook.config.json` before setting up (see [CONFIGURATION.md](CONFIGURATION.md)).

### What is stored, and the trade-off

`web/static/admin.json` is public, like everything else in the repository. It holds the token and the optional import secret, encrypted with AES-256-GCM under a key derived from the password with PBKDF2-SHA256 at 600,000 iterations. A new random salt and nonce are generated each time the file is written.

Anyone can download that file and try passwords against it offline, with no limit on attempts. The password is the only defence, which is why it must be at least 12 characters long. Someone who guesses it obtains a token that can change files in this one repository and nothing else; every change stays in git history and can be reverted.

Two things limit the exposure:

- The token is scoped to one repository and to Contents only. It cannot read other repositories, change settings or see secrets.
- Once unlocked, the token is held in memory and in `sessionStorage` for that tab. It is never written to `localStorage`.

If the password may have been guessed, revoke the token on GitHub immediately, create a new one and set up again. Deleting `web/static/admin.json` removes the old copy from the site, though not from git history.

## Unlocking on another device

Open **Settings > Sharing to GitHub**, enter the password and press **Unlock editing**. The browser downloads `admin.json` from the site, derives the key and decrypts the token locally. A wrong password shows a short message and nothing else happens. The editor page at `/edit` offers the unlock form itself when a published recipe is opened while editing is locked.

## Changing the password or the token

Both options are in **Settings > Sharing to GitHub** while editing is unlocked, and each commits a new `admin.json`. The change reaches other devices with the next deploy.

- **Change the password** asks for the current password and the new one (twice), decrypts the stored secrets with the current password and re-encrypts them under the new one. The token itself does not change.
- **Replace the token or AI secret** is for a token that has expired or been revoked, or for a new import secret. It asks for the password; a field left blank keeps the value already stored.

## The editor

With editing unlocked, **New recipe** in Settings opens a blank form that saves to GitHub, and every recipe page has an **Edit** button. Without the token, the same page edits recipes on the device instead (see [Recipes on this device](#recipes-on-this-device)); a published recipe opened there says it is part of the cookbook and offers to add a recipe of one's own. The editor is one static page at `/edit`. It is kept out of search engines and out of the site's search index.

When an existing recipe is opened, the editor loads it from the repository (or the server) as it is stored now, not from the published site, so an edit always starts from the latest saved version.

The form sits beside a checklist and a live preview. On a phone these become three tabs: **Edit**, **To do** and **Preview**.

### Form sections

- **Basics.** Title, local name, summary, servings and what one serving is called, prep, cook and rest times in minutes, difficulty and tags.
- **Where it lives.** The section, chosen from the tree, and the web address. A new subsection can be added inside the chosen section or at the top level; new sections are created in the same commit as the recipe. For a new recipe the web address follows the title until it is edited by hand. Changing the section or address of an existing recipe moves it (see [Moving a recipe](#moving-a-recipe)).
- **Photo.** A JPEG, PNG or WebP image. It is scaled to at most 1600 px wide and re-encoded as a JPEG in the browser, which also drops location data. A description (alt text) is required. A photo narrower than 1200 px gets a warning.
- **Ingredients.** Groups of rows, each with an amount, unit, ingredient, note and a scaling mode ("When the servings change"), so salt can stay to taste and eggs stay whole. Rows can be reordered by dragging or with the arrow buttons. **Paste ingredients** reads one ingredient per line with the same parser the site uses and adds the rows for review.
- **Method.** One field per step, with an optional stage heading and hands-on and waiting minutes. **Insert into the step** adds an ingredient amount, a temperature or a timer as a token (`{@flour}`, `{temp:180}`, `{timer:25}`); [RECIPE_FORMAT.md](RECIPE_FORMAT.md) lists the tokens.
- **Tips.** The recipe's tips, one per row.
- **Related recipes.** Other recipes that pair with this one, chosen by searching.
- **Variants.** Shown and kept exactly as they are, but not editable in the form. Change them in the recipe's JSON file.
- **Delete.** Only on an existing recipe (see [Deleting a recipe](#deleting-a-recipe)).

### The checklist

The checklist panel runs the same checks as `cookbook-cli check`, live in WebAssembly, after every change. Errors switch **Save recipe** off; warnings are shown but allowed. Each result names the check and links to the field it is about.

### The preview

The preview renders the recipe with the same components as the public recipe page, so scaling, tokens and tips appear as readers will see them.

### Drafts

The form is saved on the device about half a second after every change, separately for each recipe and for a new recipe. When the editor is opened again with a draft present, it offers **Restore the draft** or **Discard it**. Leaving the page with unsaved changes asks for confirmation first. A draft is removed once the recipe is saved.

## Saving and the build status

**Save recipe** checks once more for conflicts, then makes one commit to the configured branch containing the recipe, its photo and any new sections. The commit message is `content(recipes): add <title>` or `content(recipes): update <title>`. If the photo was replaced, the old photo file is removed in the same commit.

The editor then follows the CI and Deploy runs for that commit, checking every 5 seconds for up to 15 minutes:

| Status | Meaning |
|---|---|
| Building | CI and the deploy are running. CI runs the full suite before the site is deployed, so this takes a few minutes. |
| Live | The deploy has succeeded. **View the recipe** opens it. |
| A later save replaced this build | A newer push cancelled this run; the change goes live with the later build. |
| The build failed | A link opens the failed run on GitHub. The commit is already in git, so the fix is another change. |
| The build status is not available just now | The runs could not be read. The commit has still been made. |

If another commit reached the branch while the save was being made, the editor rebuilds its commit on the newest one and tries again.

## Moving a recipe

A recipe's section and web address can be changed in **Where it lives**. Saving a moved recipe makes one commit that:

- moves the recipe file to its new path,
- moves its photo with it, and
- updates every recipe that lists it under related recipes, so their links follow the new address.

While a recipe is being moved, the editor shows its old and new addresses and the save button reads **Move and save**. On the self-hosted server the move is one request, followed by a save of any other edits; if those edits fail, the editor says the recipe has already moved and names its new address.

The recipe's id is its path, so moving it changes its URL.

## Conflict protection

The editor remembers the version of the recipe it opened. If the recipe has changed in the repository since then (for example, it was edited on another device or by a direct commit), the save is refused and nothing is written. The message asks for the page to be reloaded and the change made again. A new recipe whose address is already taken is refused in the same way.

The self-hosted server applies the same protection: a save of a recipe that changed after it was opened is refused, and no file is written.

## Deleting a recipe

**Delete this recipe**, in the **Delete** section of an existing recipe, first checks every other recipe for a link to it. The check reads the recipes from the repository branch, not only from the published site, so it also sees links added in commits that have not been deployed yet. If any recipe still lists it under related recipes, deleting is blocked and those recipes are named, each with a link to edit it.

Otherwise, typing the recipe's title confirms the deletion. The recipe file and its photo are removed in one commit (`content(recipes): remove <title>`), and git keeps the history.

## Importing a recipe with AI

When the site has an AI endpoint (`ai.endpoint` in `cookbook.config.json`, `PUBLIC_AI_ENDPOINT`, or the self-hosted server with `GEMINI_API_KEY`), a new recipe has **Import from text**. Pasting any recipe text fills the form for review. Nothing is saved by the import, and the checklist runs on the result like any other recipe.

The importer is for the editor only. On GitHub Pages the Worker requires a proof signed with `ADMIN_IMPORT_SECRET`, so the same secret must be entered in the set-up form or under **Replace the token or AI secret**, where it is encrypted with the token. The Worker allows five imports per hour per address by default. See [crates/cookbook-worker/README.md](../crates/cookbook-worker/README.md) for the Worker side.

## Self-hosted mode

When the site is built with `PUBLIC_BACKEND=server` (see [DEPLOYMENT.md](DEPLOYMENT.md#self-hosting)), there is no token and no `admin.json`, and editing is never in the "not set up" state. **Unlock editing** takes the server's admin password and sets a session cookie, and **Lock editing** signs out.

The editor then saves, uploads photos, creates sections and deletes through the server's API. The server runs the same checklist before it writes a file, refuses a save that would overwrite a newer version, and refuses a delete while other recipes link to the recipe. There is no build, so a change is live as soon as it is saved. With `GIT_COMMIT=true` the server also commits each change.

The password is changed through `ADMIN_PASSWORD_HASH` in the server's environment, not from the site.
