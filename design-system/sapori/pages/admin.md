# Admin editor: overrides

- **Layout:** the form on the left and "Before you save" and a live preview on the right, using the same recipe component as the public page. On mobile, Edit | To do | Preview tabs.
- **Two modes:** with the GitHub token the full editor; without it, the simpler local mode for a visitor's own recipe (below). Both save through the same form and checklist.
- **Local mode:**
  - a short intro under the heading ("A title, the ingredients and the method are all a recipe needs"); the first time, a surface card with an accent edge says the recipe is kept only in this browser, with a primary **Got it**; after that, a muted device note
  - the same ingredients editor as the full one (below), without the key
  - the method shows a tint hint ("Write normally: times and temperatures become tappable timers.") and, under each step, the timers and temperatures found, as tint pills with a timer or thermometer icon and numerals in `--font-num`, in the order they appear
  - the local name, serving nouns, difficulty, tags, tips and related recipes fold into one "More details (optional)" panel styled like a fieldset; a field with an error opens its panel when the checklist jumps to it
  - no web address, no photo, no AI import and no insert tools; new sections stay with the recipe on the device
- **Form:**
  - grouped fieldsets: Basics, Ingredients, Method, Tips, Extras
  - inputs on `--colour-surface` with visible labels and helper text below
- **Ingredients:** a segmented **Write the list** | **Line by line**. Write the list is the default: a textarea ("One ingredient per line") with "Ways to write a line" (example and meaning, in a tint panel) under it, and **How it will read** beside it in a dashed surface panel, amounts in the primary colour in their own column and part names as primary headings; a line whose amount was not recognised gets a tint row and a warning note.
- **Ingredient rows (line by line):**
  - one line per ingredient: amount, unit, ingredient and note, with visually hidden labels and plain placeholders; the line is sized by a container query, so it stacks in a narrow column and runs as one line when there is room
  - the amount box takes a range ("2-3"); "More options" opens "Can it be left out?" (a pair of radios), the scaling question ("When you change the servings, this amount...") and, for the cookbook's own recipes, the key, in a surface panel; a folded row shows small tint chips for any of them that are set
  - rows can be reordered with drag handles and also with buttons (keyboard-accessible); ingredient rows keep their buttons beside them at every width
  - "Add an ingredient" is a dashed full-width row where the next ingredient would go
- **Parts:** a plain list has no part fields, only "Split into parts" with an "i". Once split, each part is a card headed "Part N" with its count, a fold button, its name, and a folded "Total for this part" that previews how it reads. A name used by an earlier part shows a warning panel with "Move these into part N".
- **Recipe checklist:**
  - sticky at the bottom (mobile) or the top of the preview (desktop)
  - success, warning and danger rows, each marked with an icon from `Icon.svelte` (not emoji), with the check id in muted text
  - Save is disabled while any error remains
- **Destructive actions:** Delete needs a typed confirmation of the recipe title, built into the page (no `confirm()`).
- **Save bar:** sticky at the bottom of the form, with the error count and **Save recipe**, which never wraps. On phones the back-to-top button is lifted above it.
- **After saving:** a toast reads "Saved. Live in about a minute", followed by the deploy status; in local mode, "Saved on this device".

# Settings drawer: overrides

- Order, as surface cards on the page ground under a sticky header: **Look and units** (theme, default units), **Your recipes**, **Help** (how to use, questions and answers), then **For the cookbook's owner**, a closed disclosure holding the editing panel and the link explaining the token, password and AI secret. It opens itself when editing is unlocked or a share needs the token. Fields with more to explain carry an "i" that opens a tint note underneath. Only the drawer scrolls while it is open.
- **Your recipes:** the storage note as a tint panel with an accent edge and the alert icon ("Saved only in this browser on this device…"); a bold count with the device icon; one row per recipe (title link, then a small primary "Share with everyone" link-button with the upload icon), which expands in place to a tint confirmation; then a full-width primary **Add a recipe**, a full-width **Export your recipes** that opens a dialog of three formats (Text, Spreadsheet (CSV), JSON) as large tappable rows, and a full-width danger **Clear all personal recipes** whose confirmation dialog names the count.
- **Before you save:** the checks as a short calm list. A summary line ("3 things left to fill in", or a green "Ready to save"), then numbered tint circles, each line in plain words and a link to its field. No check codes, no red crosses or group ticks; suggestions sit folded under "Suggestions, if you like". The save bar uses the same summary.
