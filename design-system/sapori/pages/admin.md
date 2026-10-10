# Admin editor: overrides

- **Layout:** the form on the left and a live preview on the right, using the same recipe component as the public page. On mobile, Edit | Preview tabs.
- **Form:**
  - grouped fieldsets: Basics, Ingredients, Method, Tips, Extras
  - inputs on `--colour-surface` with visible labels and helper text below
- **Ingredient rows:**
  - fields: amount, unit select, item, note, plus a scaling-mode menu
  - rows can be reordered with drag handles and also with buttons (keyboard-accessible)
  - "Paste ingredients" opens a textarea parsed by the Rust parser into rows for review
- **Recipe checklist:**
  - sticky at the bottom (mobile) or the top of the preview (desktop)
  - ✓ success / ⚠ warning / ✗ danger rows, using icons, not emoji, with the check id in muted text
  - Save is disabled while any ✗ remains
- **Destructive actions:** Delete needs a typed confirmation of the recipe title, built into the page (no `confirm()`).
- **After saving:** a toast reads "Saved. Live in about a minute", followed by the deploy status.
