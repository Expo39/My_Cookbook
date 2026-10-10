# Sapori design system: master

Page files in `pages/` override this file where they differ. This file was seeded with the `ui-ux-pro-max` skill and then replaced with the chosen direction: "Limestone" with Literata numerals. The reference specimen is https://claude.ai/artifact/LBhVBdgGfa3YLDKYJaHLey.

**Concept:** a Maltese kitchen, with honey-coloured globigerina limestone, capers and prickly pears. The tone is editorial and food-first. It is warm without being rustic, and there are no blog flourishes.

## Colour tokens
All colours come from these semantic tokens in `web/src/lib/styles/tokens.css`. Components never use raw hex values.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--colour-bg` | `#ece4d3` | `#221d15` | page |
| `--colour-surface` | `#f5efe2` | `#2c261b` | cards, panels, inputs |
| `--colour-ink` | `#2a2419` | `#f1e9d8` | body text |
| `--colour-muted` | `#5f5440` | `#c0b296` | secondary text, meta |
| `--colour-primary` | `#45552a` | `#b5c58a` | caper green: headings, links, controls, focus ring |
| `--colour-on-primary` | `#f5efe2` | `#1b1a10` | text on primary fills |
| `--colour-accent` | `#a3253f` | `#ec8199` | prickly pear: timers, tips, favourites, one highlight per view |
| `--colour-line` | `#d3c6aa` | `#43392a` | borders, dividers, dashed ingredient rules |
| `--colour-tint` | `#e2dcc4` | `#353021` | servings bar, selected states |
| `--colour-danger` | `#9b2c1c` | `#f0907c` | destructive actions, checklist errors |
| `--colour-warning` | `#7a5a00` | `#e6c15a` | checklist warnings |
| `--colour-success` | `#3d6b2e` | `#9fd08a` | checklist passes, "saved" |

- Every text/background pairing must pass WCAG AA (4.5:1 for body text, 3:1 for large text and UI).
- The accent is used sparingly, once or twice per view.
- Banned: purple, indigo or teal gradients; gradient text; glassmorphism; neon; any palette not built from these tokens.

## Typography
All fonts are self-hosted as woff2 under `web/static/fonts/`, subset to Latin + Latin Extended (for Maltese ċ ġ ħ ż), with `font-display: swap`.

| Token | Family | Use |
|---|---|---|
| `--font-display` | Bitter 800, tracking -0.02em | titles, section and recipe headings |
| `--font-body` | Atkinson Hyperlegible 400/700 | all running text and UI |
| `--font-num` | Literata 600, `tabular-nums` | **every numeral that is data**: amounts, times, servings, timers, step numbers |

- Type scale (rem): 0.82, 0.9, 1, 1.15, 1.35, 1.7, 2.2 and 3 (display only). The body is 1rem/1.6 with a line length of at most 68ch.
- Headings use `text-wrap: balance`. Uppercase labels are 0.78rem with +0.08em tracking.
- Banned fonts: Inter, Roboto, Poppins, Montserrat, Space Grotesk, Playfair, Fraunces, and a system-ui stack as the brand face (it is allowed only as a fallback).

## Space, shape, depth
- Spacing (rem): `--space-1` 0.25, `-2` 0.5, `-3` 0.75, `-4` 1, `-5` 1.5, `-6` 2, `-7` 3, `-8` 4. Lay out with gap (flex or grid), not with margins between siblings.
- Radius: `--radius-s` 4px for controls and chips, `--radius-m` 6px for cards, and 999px for pills and timers only. The style is not "rounded everything".
- Depth comes from lines and tints, not shadows. Only floating layers (the drawer, the cook-mode timer strip, toasts) get `--shadow-float`.
- Page gutter: at least 16px at every width. Content max-width is 72rem, and the reading column is 68ch.

## Motion
- Use Svelte transitions and CSS; no GSAP. Durations are 150 ms for micro-interactions, 220 ms for panels, and exits faster than entrances.
- Meaningful motion only: ticking off an ingredient (the strike-through plus a fade to muted), a step advance in cook mode, the drawer opening, a timer finishing (a pulse on the accent).
- `prefers-reduced-motion` removes everything except colour changes.

## Icons
- Use Lucide-style inline SVG at a 1.75 stroke, `currentColor`, through one `Icon.svelte`. No emoji anywhere in the UI.
- Icon-only buttons need an `aria-label`.

## Interaction and accessibility (from ui-ux-pro-max priorities 1-9)
- Touch targets are at least 44x44 px, with at least 8 px between them. `cursor: pointer` on everything clickable.
- Focus is visible everywhere as a 2 px `--colour-primary` outline with a 2 px offset. Never remove it.
- Labels are visible on every input and never placeholder-only. Errors sit next to their field and say how to fix the problem.
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
- [ ] Screenshots at 375 / 768 / 1024 / 1440 px in light and dark, with no horizontal scroll and nothing hidden behind fixed bars or safe areas
- [ ] All numerals that are data are in `--font-num`
- [ ] svelte-check passes with no warnings
