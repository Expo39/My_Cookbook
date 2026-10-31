# Sapori design system: master

Page files in `pages/` override this file where they differ. This file was seeded with the `ui-ux-pro-max` skill. The current direction is "Bright Mediterranean" with Literata numerals.

**Concept:** a Maltese kitchen on a bright day: sun-bleached limestone walls, the deep blue of the sea off Marsaxlokk, and terracotta pots. The page is light and airy so the food carries the colour. The tone is editorial and food-first, with no blog flourishes.

## Colour tokens
All colours come from these semantic tokens in `web/src/lib/styles/tokens.css`. Components never use raw hex values.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--colour-bg` | `#f8f7f3` | `#0e1620` | page: limestone white / night sea |
| `--colour-surface` | `#ffffff` | `#15202c` | cards, panels, inputs |
| `--colour-ink` | `#13202b` | `#eef2f6` | body text |
| `--colour-muted` | `#4b5866` | `#a9b6c3` | secondary text, meta |
| `--colour-primary` | `#0d4f8b` | `#8cc0ee` | sea blue: headings, links, controls, focus ring |
| `--colour-on-primary` | `#ffffff` | `#08233d` | text on primary and accent fills |
| `--colour-accent` | `#b5441a` | `#f08a5d` | terracotta: timers, favourites, one highlight per view |
| `--colour-line` | `#d9dfe5` | `#2b3947` | borders, dividers, dashed ingredient rules |
| `--colour-tint` | `#e6eef7` | `#1d2c3c` | servings bar, selected states |
| `--colour-danger` | `#b42318` | `#f59a8a` | destructive actions, checklist errors |
| `--colour-warning` | `#865700` | `#e8c062` | checklist warnings |
| `--colour-success` | `#2f6b2f` | `#8fd18a` | checklist passes, "saved" |

- Every text/background pairing must pass WCAG AA (4.5:1 for body text, 3:1 for large text and UI). `scripts/check-contrast.mjs` checks the pairings in light and dark; it runs in `make test-fast` and CI.
- The accent is used sparingly, once or twice per view.
- Banned: purple, indigo or teal gradients; gradient text; glassmorphism; neon; any palette not built from these tokens.

## Typography
All fonts are self-hosted as woff2 under `web/static/fonts/`, subset to Latin + Latin Extended (for Maltese ċ ġ ħ ż), with `font-display: swap`.

| Token | Family | Use |
|---|---|---|
| `--font-display` | Bitter 800, tracking -0.02em | titles, section and recipe headings |
| `--font-body` | Atkinson Hyperlegible 400/700 | all running text and UI |
| `--font-num` | Literata 600, `tabular-nums` | **every numeral that is data**: amounts, times, servings, timers, step numbers |

- Literata keeps more room above its digits than below, so its `@font-face` rules set `ascent-override: 110.5%` and `descent-override: 38.5%` (the same total height, split evenly around the digits). Numbers then sit in the middle of any pill or circle with plain flex or line-height centring; never nudge them with offsets.

- Type scale (rem): 0.82, 0.9, 1, 1.15, 1.35, 1.7, 2.2 and 3 (display only). The body is 1rem/1.6 with a line length of at most 68ch.
- Headings use `text-wrap: balance`. Uppercase labels are 0.78rem with +0.08em tracking.
- Banned fonts: Inter, Roboto, Poppins, Montserrat, Space Grotesk, Playfair, Fraunces, and a system-ui stack as the brand face (it is allowed only as a fallback).

## Space, shape, depth
- Spacing (rem): `--space-1` 0.25, `-2` 0.5, `-3` 0.75, `-4` 1, `-5` 1.5, `-6` 2, `-7` 3, `-8` 4. Lay out with gap (flex or grid), not with margins between siblings.
- Radius: `--radius-s` 4px for controls and chips, `--radius-m` 6px for cards, and 999px for pills and timers only. The style is not "rounded everything".
- Depth comes from lines and tints, not shadows. Only floating layers (the drawer, the cook-mode timer strip, toasts) get `--shadow-float`.
- Page gutter: at least 16px at every width. Content max-width is 72rem, and the reading column is 68ch.

## Loading and reloading
The prerendered page is the finished page, so a reload draws nothing twice:
- Anything visible is drawn by the server, not added once the page's code runs: the phone tabs, the bottom bar, Start cooking, the hints.
- A control waiting for the code or the recipe core is disabled but keeps its normal look. Greyed styles are only for a control that is unavailable for a reason the cook can see (a Reset with nothing ticked, the stepper at its limit), so target the control's own `[disabled]`, not `:disabled`, which also matches everything inside a disabled fieldset.
- The current section and tool are worked out from the route, which the server knows; prerendered links are relative, so comparing them with the address only works in the browser.
- State kept in the browser that changes what is drawn (the theme, closed hints) is applied by the small script in `app.html` before the first paint.
- The four Latin font files are preloaded, so text is never drawn in the fallback face first.
- A panel that is open on wide screens and folded on a phone is folded by CSS until the code takes over.
- The address can ask for a view the prerendered file cannot know, since one file serves every query. The script in `app.html` reads it and the page adapts before its code runs: `?cook` draws a cover in cook mode's colours (header, title and progress rail) that the real cook mode replaces, so a reload never shows the recipe first; a scaling address (`serves`, `x`, `pan`, `have`, `u`, `v`) keeps the amounts, servings and everything below the servings bar hidden until the scaled values are ready, holding the "Scaled" row's place, so the written amounts never show and then change; a search query hides the help and says "Loading search..."; and the editor's and a device recipe's loading notes keep the footer down at 70% of the screen.
- What a browser adds after loading holds its place from the first paint. Its recipes on the home and section pages, its favourites and recently viewed recipes, and a running timer's strip are read from storage after the page draws, so the script in `app.html` reads a small summary (`sapori:mine`, the favourites, recent and timer lists) and shows that many empty card shapes (`CardGhosts.svelte`, 10rem tall like a card) or an invisible pill in a held strip. The "nothing here yet" notes are drawn at once and hidden by the same script when there will be cards, so someone with nothing saved sees the final page straight away.

## Motion
- Use Svelte transitions and CSS; no GSAP. Durations are 150 ms for micro-interactions, 220 ms for panels, and exits faster than entrances.
- Meaningful motion only: ticking off an ingredient (the strike-through plus a fade to muted), a step advance in cook mode, the drawer opening, a timer finishing (a pulse on the accent).
- `prefers-reduced-motion` removes everything except colour changes.

## Icons
- Use Lucide-style inline SVG at a 1.75 stroke, `currentColor`, through one `Icon.svelte`. No emoji anywhere in the UI.
- Icon-only buttons need an `aria-label`.

## Interaction and accessibility (from ui-ux-pro-max priorities 1-9)
- Touch targets are at least 44x44 px, with at least 8 px between them. `cursor: pointer` on everything clickable, and `touch-action: manipulation` on every control, so a quick second tap (unticking a line) is never taken for a double-tap zoom.
- Focus is visible everywhere as a 2 px `--colour-primary` outline with a 2 px offset. Never remove it.
- Labels are visible on every input and never placeholder-only. Errors sit next to their field and say how to fix the problem. The one exception is a dense repeated row (an ingredient line by line, the shopping list's amount card), where the columns make each box plain; those keep visually hidden labels.
- Anything that needs explaining gets an "i" (`InfoTip.svelte`) beside its label: with a mouse, hover or focus shows a dark bubble (`--colour-ink` ground, at most 20rem); on touch, a tap opens a tint note with a primary edge on its own line. It has a normal pointer cursor and no hover ring, and inside a `<summary>` it never opens or closes the box.
- While a dialog is open only the dialog scrolls; the page behind stays where it was.
- Deep links everywhere: recipe view state goes in the URL (`?serves=6&u=us&v=vanilla:pods`). Back always behaves predictably.
- Reserve space for images (`aspect-ratio`), keeping CLS under 0.1. Lazy-load images below the fold and serve AVIF or WebP.

## Copy
- British English, warm and confident, written to the cook in the second person. Short sentences.
- Buttons say exactly what they do ("Start cooking", "Add to shopping list", "Save recipe").
- No shouting, exclamation-heavy warnings or apologies.

## CSS without waste
Tokens instead of repeated values. Svelte-scoped component styles, and one global sheet for tokens, reset, font faces and base typography. No inline `style=` attributes and no dead selectors (svelte-check fails on them). Rich styling is welcome where it serves the design.

## Pre-delivery checklist
- [ ] Contrast is AA in light and dark, checked on real token pairs
- [ ] No emoji icons; every icon comes from `Icon.svelte`
- [ ] Focus is visible; full keyboard path through the page; touch targets are at least 44 px
- [ ] `prefers-reduced-motion` is respected
- [ ] Screenshots at 320 / 375 / 768 / 1024 / 1440 px in light and dark, with no horizontal scroll and nothing hidden behind fixed bars or safe areas
- [ ] All numerals that are data are in `--font-num`
- [ ] svelte-check passes with no warnings
