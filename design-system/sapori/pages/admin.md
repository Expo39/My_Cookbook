# Admin editor: overrides

- **Layout:** the form on the left and the checklist and a live preview on the right, using the same recipe component as the public page. On mobile, Edit | To do | Preview tabs.
- **Two modes:** with the GitHub token the full editor; without it, the simpler local mode for a visitor's own recipe (below). Both save through the same form and checklist.
- **Local mode:**
  - a short intro under the heading ("A title, the ingredients and the method are all a recipe needs") and a muted device note
  - a tint panel leads the ingredients with the primary **Paste a list** button; later pastes use "Paste more"
  - each ingredient row shows Amount + Unit, Ingredient + Note, and two tick boxes (Optional, To taste); the rarer fields fold under a "More options" `<details>`, and a group's total under "Group total (optional)"
  - the method shows a tint hint ("Write normally: times and temperatures become tappable timers.") and, under each step, the timers and temperatures found, as tint pills with a timer or thermometer icon and numerals in `--font-num`, in the order they appear
  - the local name, serving nouns, difficulty, tags, tips and related recipes fold into one "More details (optional)" panel styled like a fieldset; a field with an error opens its panel when the checklist jumps to it
  - no web address, no new sections, no photo and no AI import
- **Form:**
  - grouped fieldsets: Basics, Ingredients, Method, Tips, Extras
  - inputs on `--colour-surface` with visible labels and helper text below
- **Ingredient rows:**
  - fields: amount, unit select, item, note, plus a scaling-mode menu
  - rows can be reordered with drag handles and also with buttons (keyboard-accessible)
  - "Paste ingredients" opens a textarea parsed by the Rust parser into rows for review
- **Recipe checklist:**
  - sticky at the bottom (mobile) or the top of the preview (desktop)
  - success, warning and danger rows, each marked with an icon from `Icon.svelte` (not emoji), with the check id in muted text
  - Save is disabled while any error remains
- **Destructive actions:** Delete needs a typed confirmation of the recipe title, built into the page (no `confirm()`).
- **Save bar:** sticky at the bottom of the form, with the error count and **Save recipe**, which never wraps. On phones the back-to-top button is lifted above it.
- **After saving:** a toast reads "Saved. Live in about a minute", followed by the deploy status; in local mode, "Saved on this device".

# Settings drawer: overrides

- Order, as surface cards on the page ground under a sticky header: **Look and units** (theme, default units), **Your recipes**, **Help** (how to use, questions and answers), then **For the cookbook's owner**, a closed disclosure holding the editing panel and the link explaining the token, password and AI secret. It opens itself when editing is unlocked or a share needs the token. Fields with more to explain carry an "i" that opens a tint note underneath. Only the drawer scrolls while it is open.
- **Your recipes:** the storage note in muted small text; a bold count with the device icon; one row per recipe (title link, then a small primary "Share with everyone" link-button with the upload icon), which expands in place to a tint confirmation; then a full-width primary **Add a recipe**, Export and Import as an equal two-column grid, and a full-width danger **Clear all personal recipes** whose confirmation dialog names the count.
