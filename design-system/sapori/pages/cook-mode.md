# Cook mode: overrides

Cook mode follows the patterns the best-regarded cooking apps share (NYT Cooking, Crouton, Stashcook, Cooklang): one step per screen, the ingredients that step uses listed under it and ticked off as they go in, the full list one tap away, timers inside the step, and enough context to look away and come back.

- **Layout:** a full-screen dialog on `--colour-bg`. The step column is at most 44rem; the step text is 1.7rem (2.2rem from 48rem) at 1.45 line height.
- **Header:** a surface bar with the exit cross, an accent "Cooking" eyebrow over the recipe title in the display face (one line, ellipsis), and an icon-only dark theme toggle (`aria-pressed`) that follows the global theme.
- **Progress rail:** under the header, one thin pill segment per step: done in primary, the current one in accent, the rest in line colour. It is decorative; "Step 3 of 8" beside the numeral is the status text.
- **Step marker:** the step number in `--font-num` inside a 4.5rem accent ring (5.5rem and display size from 48rem), with "Step N of M" and the stage heading (primary uppercase label) beside it.
- **For this step:** a surface card with a 4 px primary top rule, labelled "For this step", listing the lines the step uses, each with a checkbox, the amount in primary `--font-num` and the words. Rows share one grid through `subgrid`, so boxes, amounts and words form straight columns; the box sits level with the first line. Ticks are the recipe page's ticks (`Ticks`), so a line ticked here is ticked there. When a line comes from one of several parts, a tint pill names the part. A step that uses nothing says "Nothing new to add here."
- **Which lines a step uses** comes from `web/src/lib/recipe/step-ingredients.ts`: `{@key}` tokens always count, and otherwise the step's words are matched against each line's main noun (plurals folded, accents ignored), a word only that line has ("egg" for the egg yolks), or the two-word name when the noun is general or shared ("soy sauce", "spring onions"). A line that two parts share goes to the part the cook is working on. Recipes need no extra markup for this.
- **Up next:** under a dashed rule, a muted "Up next" label and the next step's first sentence, clamped to two lines.
- **The full list:** from 64rem it is a sticky surface card to the left of the step, with "N of M ready", the lines the current step uses marked with a primary edge and tint, and scrolled into view on each step. Below 64rem it is a bottom sheet (at most 80% of the screen, `--shadow-float`, over a scrim) opened by **Ingredients** in the footer or the `i` key; the header, step and footer are inert while it is open, focus moves to its close button, and Esc closes the sheet before cook mode.
- **Navigation:**
  - the footer holds Previous (icon only below 30rem), Ingredients (below 64rem) and a primary Next, at least 3.75rem tall; swipe on touch; left and right arrow keys
  - Space starts the step's first timer; Esc exits
  - opening cook mode keeps the page's scroll position (`data-sveltekit-noscroll`), so nothing jumps when it closes
- **Finished:** Finish on the last step shows "Ready to serve" (display face, focused) under a success check, the recipe's tips in a surface panel with an accent edge headed "From the chef", then **Back to the recipe** (primary) and **Cook it again**.
- **Timers:**
  - a pinned strip of active timers along the top, each a pill with its name and a countdown in `--font-num`
  - they are stored as end timestamps, so they survive reloads
  - on finishing, the pill pulses in accent and a sound and vibration play
- **Wake lock** is on while cook mode is open. If the API is unavailable, a one-line notice says "Keep your screen on: this browser can't do it for you".
- **Motion:** a step slides in from the side (220 ms); the sheet rises; the rail segments change colour. `prefers-reduced-motion` keeps only the colour changes.
