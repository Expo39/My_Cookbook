---
name: add-recipe
description: Add or update a recipe in the Sapori ta' l-kċina cookbook. It turns pasted text, a web page, a photo of a handwritten or printed recipe, or a description from memory into a validated recipe JSON file under recipes/, then proposes a commit. Use it whenever someone wants to add, import, save, transcribe or put a recipe in the cookbook, even when they just paste a recipe or say "add my nanna's pastizzi" or "can you put this in the book". Also use it to fix or extend an existing recipe file, for example to add a photo, tokens or times.
---

# Add a recipe

The cookbook is a static site built from `recipes/`: one JSON file per recipe, with the folder tree as the site's sections. Each file has to pass the recipe checklist (`cookbook-cli check`) before it can go live. CI runs the same checks, so a file that fails here also fails the deploy.

Read `docs/RECIPE_FORMAT.md` before writing anything. It is the contract, and it explains tokens, scaling modes and variants. Use two existing recipes as models of the house style:
- `recipes/first-courses/pasta/one-pot-pasta-with-fresh-tomatoes.json`, a simple recipe
- `recipes/main-courses/beef-steak/beef-wellington.json`, which has stages, timers and internal temperatures

## 1. Get the source
- **Pasted text:** use it as given.
- **A URL:** fetch the page (with the web-fetch agent if there is no fetch tool) and take only the recipe. Credit the source in `origin`, e.g. "Adapted from Serious Eats". Taking a recipe without credit is what got recipe scrapers shut down.
- **A photo** of a card, book page or handwriting: read the image and transcribe it. Read amounts with care. If a number is ambiguous, say so instead of guessing.
- **From memory or conversation:** if the amounts or the method are missing, ask for them first and write nothing yet. A file with no amounts still passes the checklist, so it would go live looking like a finished recipe. Write the file once there is enough to cook from.

Never make up quantities, ingredients or techniques, and do not fill a gap with a plausible step such as "combine everything and bake". The recipes are cooked from as written, and a wrong amount ruins a meal. If a detail is missing or looks wrong in an otherwise complete recipe, write the file without it and list it in your reply as a question. Only quote a convention from the existing recipes (a credit, a name, a section) after you have seen it in the files.

## 2. Pick the section
List the tree with `find recipes -name _section.json | sort`, and read the titles. Put the recipe in the best existing folder. Create a new subsection only when nothing fits: make a folder with a slug name and an `_section.json` file (`{"title": ..., "order": n}`). Say which section you chose and why, in one line.

The filename is the slug: lowercase letters, digits and hyphens, made from the title (`pastizzi-tal-irkotta.json`). The recipe id is the path without `.json`.

## 3. Write the JSON
Write it to match the house style:
- **British English, warm and plain:** imperative steps, articles ("Heat the oil in a large pan"), no exclamation marks, no filler such as "simply", "just" or "perfect". Use `titleLocal` for the Maltese or Italian name only when the source or the person adding the recipe gives one and it differs from `title`.
- **`summary`:** one or two sentences, 200 characters at most. Anything extra goes into `tips`.
- **Amounts:**
  - Keep the units as written, but prefer metric. If the source uses cups, convert dry goods with the density of their `food` id, and put the original in `alt` only when that helps.
  - Ranges are `{"min", "max"}`, but only for counts, e.g. "2-3 cloves". A weight or volume takes one amount, the middle of the source's range ("100-150 g" becomes 125 g), because a wide range pushes the ingredient names out of line on the page. Say in a tip that the amounts are a guide when the source gave ranges.
  - Amounts like "Zest of 1 lemon" use `prefix`.
  - Lines with no amount ("Salt, to taste") have no `amount`. Use `"scale": "toTaste"` when the line says "to taste".
- **Scaling mode per ingredient:**
  - `discrete` for whole things: eggs, cloves, onions, tins, slices.
  - `seasoning` for salt and spices in large batches.
  - `fixed` for per-item amounts such as "½ tsp sugar per ramekin" or a single bay leaf.
  - Otherwise leave the default, linear.
- **`food` ids** link an ingredient to the density table, so cups and grams convert and shopping lists merge. Set one only for these known ids: butter, breadcrumbs, cocoa, cornflour, couscous, cream, flour, flour-00, flour-bread, flour-plain, flour-self-raising, flour-wholemeal, ground-almonds, honey, lentils, milk, oats, oil, olive-oil, rice, salt, semolina, sugar, sugar-brown, sugar-caster, sugar-granulated, sugar-icing, water, yoghurt, egg.
- **Tokens in steps:** these make the method scale and convert with the reader's settings.
  - When a step restates an amount, give that ingredient a `key` and write `{@key}`, or `{@key:amount}` for the amount alone.
  - Oven temperatures: `{temp:220/200}` for conventional/fan. If the source gives only a fan temperature, conventional is fan + 20. The token shows the reader both, so write "Heat the oven to {temp:180/160}", not "a fan oven". Internal or meat temperatures take `!`: `{temp:52-55!}`.
  - Durations: `{timer:12-15}`, `{timer:4h}` or `{timer:30s}`. Name a timer when two can run at once: `{timer:15|sauce}`.
  - Tokenise only exact restatements, and never change a number while doing it.
- **Stages:** a long method split over days or parts gets `heading` on the first step of each stage.
- **`times`:** prep, cook and rest in minutes. Take them from the source, or estimate them from the method's own durations and say they are estimates. Leave out what you cannot justify.
- **`tips`:** the cook's notes, substitutions and serving ideas from the source.
- **`related`:** ids of recipes it pairs with, only when there is a real link.
- **A dish photo:** copy it next to the recipe file and set `"image": {"src": "<file>", "alt": "<what is in the photo>"}`. The photo should be at least 1200 px wide. The build resizes it and draws the share cards.

## 4. Check, then fix
Run `.claude/skills/add-recipe/scripts/check.sh recipes/<path>.json`. It runs `cookbook-cli check` in the Docker dev container; nothing gets installed on the host. Fix every error and run it again until it passes. Look at each warning: fix it when you can (British spelling, unused keys, a missing time you can justify), and otherwise mention it.

Common errors:
- `E-TOKEN-UNRESOLVED`: a `{@key}` has no matching ingredient `key`.
- `E-SECTION-MISSING`: the folder has no `_section.json`.
- `E-SLUG-FORMAT`: the filename has capitals, spaces or accents.
- `E-SCALE-FRACTIONAL`: a whole-piece ingredient ends up as a fraction when scaled. Mark it `discrete`.

If you changed anything outside `recipes/`, run `make test-fast` as well.

## 5. Report and propose the commit
Reply briefly with:
- where the file went (and any new section)
- what you could not fill in, or estimated, as questions for the person who asked
- the checklist result

Then propose the commit. Do not make it unless asked. The repo's format is `<type>(<scope>): <phrase>` with **no trailers or co-author lines**:
- `content(recipes): add Pastizzi tal-Irkotta`
- `content(recipes): update Beef Wellington`

Recipes can also be added in the site itself: Settings > For the cookbook's owner > Unlock editing opens the admin editor, which runs the same checklist in the browser. This skill is the route from the terminal.
