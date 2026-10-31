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
Read `crates/cookbook-ai/prompts/recipe-style.md` and follow it exactly. It holds the house rules (language, title and summary, amounts and ranges, scaling modes, `food` ids, timers, temperatures, `{@key}` tokens, stages, times and tips), and the in-site importer gives Gemini the same file word for word, so a recipe reads the same however it was added. `crates/cookbook-ai/prompts/example-input.txt` and `example-output.json` are a worked example of the rules applied.

On top of those rules, the skill can do what the importer cannot:
- **`related`:** ids of recipes it pairs with, only when there is a real link and you have seen the recipe's file.
- **A dish photo:** copy it next to the recipe file and set `"image": {"src": "<file>", "alt": "<what is in the photo>"}`. The photo should be at least 1200 px wide, and the description is required. The build resizes it and draws the share cards.
- **Times:** when the source gives none, you may estimate them from the method's own durations, but say in your reply that they are estimates. The importer never estimates.

When you change a house rule, change it in `recipe-style.md` and keep the worked example passing; `cargo test -p cookbook-ai` checks that it does.

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
