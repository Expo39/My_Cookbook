# Cook mode: overrides

- **Layout:** full screen on `--colour-bg`, with one step at a time at 1.7rem (2.2rem on desktop) and a max line length of 40ch.
- **Ingredients for the step:** listed above the step text with their amounts.
- **Desktop:** the full ingredient list is in a left column.
- **Navigation:**
  - large Previous / Next buttons at the bottom; swipe on touch; left and right arrow keys
  - Space starts the step's timer; Esc exits
  - progress is shown as "Step 3 of 8" in `--font-num`
- **Timers:**
  - a pinned strip of active timers along the top, each a pill with its name and a countdown in `--font-num`
  - they are stored as end timestamps, so they survive reloads
  - on finishing, the pill pulses in accent and a sound and vibration play
- **Wake lock** is on while cook mode is open. If the API is unavailable, a one-line notice says "Keep your screen on: this browser can't do it for you".
- **Dark theme recommended:** a "Dark" toggle sits in the cook-mode header and follows the global theme by default.
