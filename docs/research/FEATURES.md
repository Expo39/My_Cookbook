# Feature research

Survey of recipe products and sites, October 2026, used to refine the planned feature set for *Sapori ta' l-kċina*: a static SvelteKit site on GitHub Pages with a Rust/WASM core, no accounts, on-device state only.

Products surveyed: NYT Cooking, Serious Eats (via secondary sources), King Arthur Baking, BBC Good Food, Paprika, Mela, Crouton, Pestle, Samsung Food (Whisk), Mob, Recipe Keeper, Epicurious / Bon Appétit, The Kitchn, Jamie Oliver, Ottolenghi, WP Recipe Maker (which powers most food blogs), Cooklang and CookCLI, and Mise. Several app claims come from App Store listings, which are the vendor's own marketing, and are marked as such.

Priorities: **Must** = needed for a credible first release; **Should** = next; **Could** = if time allows; **Skip** = wrong fit.

---

## (a) Feature table

| Feature | Who does it well | UX detail worth copying | Fit (static, no accounts) | Priority |
|---|---|---|---|---|
| Scale by servings | NYT Cooking ([help](https://thenewyorktimeshelpcenter.helpjuice.com/360011047512-New-York-Times-Cooking/recipe-scaling)), Mob ([listing](https://apps.apple.com/us/app/id6670216494)), Recipe Keeper | NYT shows scaled amounts **in a different colour** and puts a "scaling active" indicator in cook mode and on print. Scaling also changes amounts in the method and the yield. | Pure client-side WASM | Must |
| Scale by multiplier (½x, 2x) | NYT Cooking (only offers ½ and 2) | Offer preset chips (½, 1, 1½, 2, 3) **and** a free stepper, because most real use is halving or doubling | Same | Must |
| Scale by "ingredient I have" | King Arthur's baker's % method ([blog](https://www.kingarthurbaking.com/blog/bakers-percentage/)) | Tap any ingredient amount, type what you have (e.g. 340 g flour), and the whole recipe rescales to that. None of the consumer apps surveyed does this well, so it is a differentiator. | Same | Should |
| Scale by pan size | WP Recipe Maker Premium "Advanced Adjustable Servings" ([plugin](https://wordpress.org/plugins/wp-recipe-maker/)); NYT adjusts "some pan sizes" | Pick the shape and size of the pan you own. The factor is the area ratio, shown with a warning about depth and bake time. | Same | Should |
| Per-ingredient scale mode | Cooklang `=` fixed quantities ([conventions](https://cooklang.org/docs/conventions/)) | Fixed items are visibly marked as not scaled. Seasoning shows a **range**, not one number (see section b). | Schema change | Must |
| Smart rounding | Cooklang blog ([scaling](https://cooklang.org/blog/26-how-to-scale-recipes-without-mistakes)) | Never show 1.4999 cups or 1.33 eggs. Snap amounts to measurable values per unit (see the tables below). | Rust core | Must |
| Metric / US units | NYT Cooking (metric toggle beside the scaling control), Paprika (scales alt measurements, [listing](https://apps.apple.com/app/id1303222868)) | Keep the toggle global and remembered. Volume<->weight conversion needs **per-food density**: a single cup->gram factor is wrong (flour ~120 g, sugar ~200 g per cup). | Density table in core | Must |
| °C / °F / gas mark | WP Recipe Maker unit conversion; SBS/Jamie show a fan-oven note | Show conventional and fan together: "200 °C (180 °C fan) / 400 °F / gas 6". Round °F to the nearest 5 (oven dials go in 25). | Already tokenised | Must |
| Amounts inline in steps | NYT (scales the method), Crouton and Pestle (ingredients highlighted in a step; **tap to reveal** the quantity, [MacStories](https://www.macstories.net/reviews/pestle-1-2-the-macstories-review/)) | Inline amounts on the page; in cook mode, also list the ingredients used in the current step beneath it | `{@key}` tokens exist | Must |
| Tick off ingredients and steps | Paprika (cross off, highlight current step), The Kitchn Cook Mode+ (checklist plus **collapse completed steps**, [AOL/Kitchn](https://www.aol.com/articles/introducing-cook-mode-191500104.html)) | Tapping a step dims it and moves the focus to the next one. Ingredient ticks double as "I have this" for the shopping list. | localStorage | Must |
| Cook mode with wake lock | Mela (large type, one step at a time, ingredients alongside on wide screens, [MacStories](https://www.macstories.net/?p=67531)), Pestle (big "Start Cooking" button), BBC Good Food (screen-on only, and only for subscribers) | Full-screen view with large type and big prev/next targets for wet hands. On a wide screen, ingredients go on the left and the step on the right. | Screen Wake Lock API. iOS home-screen PWAs were broken until iOS 18.4 ([WebKit 254545](https://bugs.webkit.org/show_bug.cgi?id=254545)); fall back to a "keep screen on" notice. | Must |
| Multiple timers | Paprika (detects times in steps, tap to start, list of active timers, up to 99 h), Crouton (start timers from steps; a **heads-up display** keeps them visible), Mela (Live Activities) | Name timers from the step ("Pasta - 4:12"). Store the end time as a timestamp so timers survive reload and screen lock. Pin a strip of active timers. Alert with sound, vibration and a notification. | Notifications API needs permission; the timestamp approach works offline | Must |
| Shareable card image + QR | Nobody surveyed does this well (Crouton and Pestle only offer PDF, text or link) | Generate a portrait card on-device and share it with the Web Share API (files) | resvg in WASM fits the Rust core | Should |
| Print card | NYT (option to include the photo), WP Recipe Maker (interactive print page that keeps the chosen servings), Pestle (PDF/print/text) | Print **what you see**: the current scale, units and variant. Toggles for photo, notes and tips. | CSS `@page` | Must |
| OG images | Google requires `image` for recipe rich results; 16:9, 4:3 and 1:1 recommended ([Google](https://developers.google.com/search/docs/appearance/structured-data/recipe)) | One image per recipe, rendered at build time from the same template as the card | Build step | Should |
| Shopping list | Samsung Food (merges duplicates across recipes, sort by aisle or by recipe, [listing](https://apps.apple.com/gb/app/id1133637674)), Mela (items pre-ticked, untick what you have), CookCLI (aisle config, pantry subtraction, [docs](https://cooklang.org/docs/use-cases/shopping/)) | Add a recipe **at its current scale**; NYT keeps original amounts in its grocery list, which should be avoided. Merge by food id plus compatible unit, group by aisle, and offer "copy as text" for sending. | localStorage | Should |
| Search, filters, "what can I make" | NYT (suggestions as you type, filters), Mob (search by ingredient), Ottolenghi (browse by course, main ingredient and **season/occasion**, [site](https://ottolenghi.co.uk/pages/recipes)) | With 19 recipes, instant search plus 3-4 facets is enough. "What can I make" ranks recipes by the share of non-pantry ingredients matched. | Prebuilt index | Should |
| Favourites, notes, recently viewed | NYT private notes, Recipe Box, "Mark as Cooked" ([help](https://thenewyorktimeshelpcenter.helpjuice.com/360011047512-New-York-Times-Cooking/19627732008468-Public-and-Private-Cooking-Notes)) | NYT notes **cannot be edited after submission**, which should not be copied: make notes editable and dated. Add "Cooked on..." entries. | localStorage, with export/import JSON for backup | Should |
| "Serve at" planner | Mise (works back from the serving time to a start time and running order), Chef's Multi-Dish Timer, MealTime ([listing](https://mwm.ai/apps/mealtime/1016295040)) | Enter "serve at 19:30" to get a timeline with clock times per step, and a "start by" time shown up front | Needs per-step durations (schema change) | Could |
| JSON-LD | Google Recipe docs | Use `HowToStep` per step and `HowToSection` per group; put the servings count in `recipeYield`; ISO 8601 times; prep and cook time always together | Build time | Must |
| PWA offline | Mela, Paprika (native apps) | Precache all recipes (small); cook mode must work in airplane mode | Service worker | Must |
| Variants | Cooklang optional `@?` items ([spec](https://cooklang.org/docs/spec/)); Google says variants are **not** `HowToSection` | Variant choice is part of the URL and the print and card state | Exists | Should |
| Voice next/back | Pestle (custom trigger words), Crouton hands-free, Epicurious (2014) | Gimmicky on the web; Web Speech support is patchy and it needs the microphone | Poor | Skip |
| Shared live cooking | Pestle SharePlay | Needs a backend | None | Skip |
| Nutrition | Jamie Oliver, BBC Good Food, NYT ("rough estimates") | False precision for home recipes | Needs a nutrition DB | Skip |
| Retailer checkout | Samsung Food, NYT (Instacart) | Not relevant to Malta | None | Skip |

---

## (b) Scaling logic

### Principles
1. **Scale mass, not volume.** Weight is the only measure that scales linearly ([Cooklang blog](https://cooklang.org/blog/26-how-to-scale-recipes-without-mistakes); [King Arthur](https://www.kingarthurbaking.com/blog/bakers-percentage/)). Author recipes in grams/ml and derive US units for display.
2. **Scale exactly, round only when displaying.** Keep the exact factor in state. Round each displayed amount once, at the end; never round and then scale again.
3. **Times, temperatures and cookware never scale automatically.** NYT scales amounts and "some pan sizes" but not times or temperatures, and tells users to rely on sensory cues ([NYT](https://thenewyorktimeshelpcenter.helpjuice.com/360011047512-New-York-Times-Cooking/recipe-scaling)). Pasta still takes 10 minutes at 4x ([Cooklang](https://cooklang.org/blog/26-how-to-scale-recipes-without-mistakes)).
4. **Be honest when scaled.** Show a persistent "Scaled x1.5 / reset" chip and tint the scaled numbers (as NYT does). Any step that mentions a time or a pan gets a short caveat when the factor is not 1.

### Per-ingredient modes (recommended schema: extend `scale`)

| Mode | Behaviour | Use for |
|---|---|---|
| `linear` (default) | amount x factor | flour, liquids, meat, veg, pasta |
| `fixed` | unchanged at any scale (Cooklang `=`) | 1 bay leaf, oil for greasing, pasta-water salt per litre |
| `toTaste` | no amount, or the amount shown as "to taste" | finishing salt and pepper |
| **`seasoning`** (new) | shows a **range** from `base x f^0.75` to `base x f` when f > 1, and exact linear when f <= 1. Example at 2x: "1½-2 tsp salt, start low". | salt in a dough or sauce, spices, chilli, garlic in bulk, acid, leaveners when f > 2 |
| **`discrete`** (new, or derived from a count with no unit) | rounds to a whole number (or to halves if `step: 0.5`) | eggs, cloves, tins, sheets of pastry, lemons |

Guidance supporting a sub-linear range: herbs and spices should go up by about half when doubling and then be tasted ([KitchenAid](https://www.kitchenaid.com/countertop-appliances/pinch-of-help/doubling-a-recipe)). Cooklang suggests seasoning at about 1.5x and leaveners at about 1.75x when doubling ([Cooklang](https://cooklang.org/blog/26-how-to-scale-recipes-without-mistakes)). These are rules of thumb, so show a range rather than inventing a precise number.

### Eggs and other discrete items
- Store an optional `each` weight on discrete items (egg about 50 g out of the shell, [King Arthur](https://www.kingarthurbaking.com/blog/bakers-percentage/); [A Day in the Kitchen](https://www.adayinthekitchen.com/how-to-halve-an-egg/)).
- **Savoury:** round to the nearest whole egg, minimum 1.
- **Baking** (recipe `category: baking`, or the ingredient is marked `precise`): if the fractional part is between 0.25 and 0.75, show "1½ eggs (75 g beaten)"; otherwise round to the whole egg. Halving a 3-egg cake therefore gives "1½ eggs (75 g beaten egg)", which can be weighed.
- Separated eggs (yolks or whites) use their own weights (yolk about 18 g, white about 32 g).
- Garlic cloves, tins and pastry sheets: round up, because a little extra is harmless and partial tins are awkward.
- Show a one-line note whenever discrete rounding changes the ratio by more than 15%. For example, 0.5x of 1 egg is "1 small egg (or 25 g beaten)".

### Cooking time when scaled
- Leave the written times unchanged. When f != 1, show "Check from the original time; larger batches may need longer" beside every `{timer}` that comes from an oven, braise or reduction step ([KitchenAid](https://www.kitchenaid.com/countertop-appliances/pinch-of-help/doubling-a-recipe): check at the original time, then every 5 minutes).
- Allow an optional per-step hint, for when the author knows better: `{timer:45|scaled:roast}` or a step field `timeScales: "depth"`. Default: no change.
- Reductions and sauces: a smaller batch reduces faster, so flag "watch closely" when f < 1 ([Cooklang](https://cooklang.org/blog/26-how-to-scale-recipes-without-mistakes)).
- Searing and sautéing: past a threshold (e.g. f >= 2), add "cook in batches; do not crowd the pan".

### Pan sizes
- Recipe-level `pan: { shape: round|square|rect|loaf, size: [w, l?] (cm), depth? }`.
- Factor = new area / original area (round pi r^2, rectangle wxl). Reference points: a 20 cm square about a 23 cm round; a 23x33 cm tray about 2x a 23 cm square ([Food Network chart](https://www.foodnetwork.com/recipes/packages/baking-guide/baking-pan-conversion-calculator); [ATK](https://www.americastestkitchen.com/articles/8002-cake-pan-sizes): a 9-inch round is over 25% bigger than an 8-inch).
- Area is only valid when the depth is the same. Between loaf, bundt and tray, warn about depth, and say that deeper pans need longer and lower ([Escoffier](https://www.escoffier.edu/?p=29316); [Pretty Simple Sweet](https://prettysimplesweet.com/how-to-convert-cake-pan-sizes/)).
- Fill no more than ¾ deep.
- Show the pan option only on recipes that have `pan` set.

### Limits
- Replace the boolean `scalable` with `scaling: { min?, max?, note? }`. For example, a yeasted dough might have `{ min: 0.5, max: 3, note: "Yeast doughs below 500 g flour are hard to knead" }`. Quarter batches rarely work in baking ([Cooklang](https://cooklang.org/blog/26-how-to-scale-recipes-without-mistakes)).
- Outside the limits, still allow scaling, but with a visible warning; do not block it.

### Rounding tables (display only)

**Metric**

| Unit | Range | Round to |
|---|---|---|
| g | < 5 | 0.5 g (yeast, salt, spices); show "pinch" below 0.5 g |
| g | 5-100 | 1 g if the recipe is `precise` (baking), else 5 g |
| g | 100-1000 | 5 g if precise, else 10 g |
| g -> kg | >= 1000 | 0.05 kg ("1.25 kg") |
| ml | < 15 | convert to tsp/tbsp (5 / 15 ml) |
| ml | 15-250 | 5 ml |
| ml | 250-1000 | 10 ml (25 ml if not precise) |
| ml -> l | >= 1000 | 0.05 l |

**US / spoons**

| Unit | Allowed values | Rules |
|---|---|---|
| tsp | ⅛ ¼ ½ ¾ 1 1½ 2 2½ | below ⅛ -> "pinch"; >= 3 tsp -> tbsp |
| tbsp | ½ 1 1½ 2 ... | >= 4 tbsp -> ¼ cup; express leftovers as "+ 1 tsp" only if the remainder is at least ½ tsp |
| cup | ¼ ⅓ ½ ⅔ ¾ 1 1¼ ... | avoid "1 cup + 10 tbsp + 2 tsp" chains; if the nearest fraction is more than 5% off, show the weight instead |
| oz | ¼ oz steps below 4 oz, ½ oz to 16 oz | >= 16 oz -> lb with ¼ lb steps |
| °F | nearest 5 (nearest 25 for oven settings) | 180 °C -> 350 °F, 200 °C -> 400 °F |
| gas mark | table lookup | 140 °C->1, 150->2, 160/170->3, 180->4, 190->5, 200->6, 220->7, 230->8, 240->9 |

**Counts:** whole numbers, or halves where `step: 0.5`. Use vulgar fractions (½, ¼, ¾) in display, never decimals.

**Lint (CLI `check`):** render every recipe at 0.5x and 2x, as the Cooklang blog advises ("test published recipes at 2x and 0.5x"). Fail on: a fractional egg in savoury recipes, a "pinch" replacing a measured leavener, and an amount that rounds to 0.

---

## (c) Recipe-card sharing

None of the surveyed apps generates a good shareable *image* card. Crouton exports PDF and links; Pestle exports link, PDF, print and text ([MacStories](https://www.macstories.net/reviews/pestle-1-2-the-macstories-review/)); Recipe Keeper builds PDF cookbooks ([listing](https://apps.apple.com/au/app/recipe-keeper/id974683711)). This is open ground and suits a portfolio cookbook.

### Formats

| Target | Size (px) | Ratio | Notes |
|---|---|---|---|
| WhatsApp / Instagram feed (default) | 1080 x 1350 | 4:5 | default card; reads well in chat |
| Instagram / WhatsApp Story | 1080 x 1920 | 9:16 | keep a 250 px safe zone at the top and bottom for the UI |
| Pinterest | 1000 x 1500 | 2:3 | Pinterest's recommended ratio; taller than 1:2.1 gets cropped ([Tailwind](https://www.tailwindapp.com/pinterest-marketing/course/pin-image-size-and-styles)) |
| OG / link preview | 1200 x 630 | 1.91:1 | built at build time; no ingredient list, just photo, title and times |
| Google rich result images | >= 50k px, at 16:9, 4:3 and 1:1 | | Google ([docs](https://developers.google.com/search/docs/appearance/structured-data/recipe)) |
| Print card | A6 (105 x 148 mm) or 5x7 in, plus A4 full page | | CSS `@page`; ingredients on the front, method on the back for A6 duplex |

### What goes on the card
- Photo (top 40-50%), title, and the subtitle in Maltese/Italian if it exists.
- One meta row: serves (the **scaled** value), total time, difficulty.
- Ingredients at the current scale, units and variant, every one in full: a long line wraps under itself, the text shrinks to fit, and a long list runs in two balanced columns.
- No method on the image (it never fits legibly); the QR code carries it.
- QR code (about 220 px, bottom corner, with a quiet zone) linking to the canonical URL **with state**: `/r/first-courses/pasta/one-pot-pasta?serves=6&u=us&v=vanilla:pods`.
- Small wordmark *Sapori ta' l-kċina* and the short URL as text, for people who will not scan.

### How to build it
- Render an SVG template in Rust and rasterise it with resvg compiled to WASM ([resvg-js wasm build](https://github.com/PurpleLover/resvg-js/blob/main/README.md)). Fonts must be passed in as buffers. The QR code can come from the `qrcode` crate, in the same core.
- The same renderer runs at build time (native) for OG images, so there is one template and two outputs.
- Share with `navigator.canShare({ files })` -> `navigator.share`, as web.dev recommends ([web.dev](https://web.dev/articles/files/share-files)). Firefox desktop has file sharing behind a flag, so fall back to download plus "copy link".
- The card must render offline (PWA).

---

## (d) New ideas not in the plan (ranked)

1. **State in the URL.** Encode servings, units and variant in the query string. This makes shared links, QR codes, print and the back button all consistent. It is cheap and is needed for the card anyway.
2. **"Seasoning" range mode.** Show "1½-2 tsp" when scaled up instead of a false-precise number (section b).
3. **Discrete items with gram fallback.** "1½ eggs (75 g beaten)" for baking, and whole eggs for savoury dishes.
4. **"In this step" ingredient list in cook mode.** Derived from the `{@key}` tokens; this is the web equivalent of the Crouton and Pestle tap-to-reveal.
5. **Scaling lint at 0.5x and 2x** in `cookbook-cli check`, which catches bad recipes before they ship.
6. **"Cooked on" log plus dated, editable notes**, which the NYT "Mark as Cooked" model improves on. Export/import as JSON, since there is no sync.
7. **Collapse completed steps**, with a "jump to where I was" banner on return within 24 hours (as in The Kitchn Cook Mode+).
8. **Fractional ingredient references in steps**, e.g. "add half the {@sugar*1/2}". Real recipes split ingredients across steps all the time.
9. **Baker's percentage view** for doughs and pastry: a toggle that shows the % column (flour = 100%). It pairs with "scale by ingredient I have" ([King Arthur Pro](https://www.kingarthurbaking.com/pro/reference/bakers-percentage)).
10. **Provenance and bilingual title.** A `titleLocal` (Maltese/Italian name) and `origin` ("Nanna Rita, Żebbuġ"). This gives the heritage without a life-story preamble and is good for showing off.
11. **Season facet** (Ottolenghi browses by season and occasion). Useful once the collection grows past about 40 recipes.
12. **Multi-recipe cook session** (Mela loads several recipes into cook mode). Combined with "serve at", it plans a whole meal. This depends on the planner.
13. **Pantry staples list.** Items always ticked as "have" in the shopping list and ignored by "what can I make" (CookCLI pantry subtraction, [docs](https://cooklang.org/docs/use-cases/pantry/)).
14. **Section print** ("print all pasta recipes") as a mini cookbook with a contents page, which Recipe Keeper sells as a feature. Pure CSS.

---

## (e) Anti-patterns to avoid

- **Life-story preambles and "Jump to recipe" buttons.** A jump button is a symptom: if one is needed, the page is wrong. Ingredients must be visible on the first screen on mobile. Keep a 1-2 sentence `summary` and put stories in an optional collapsible "About this dish" *below* the method.
- **Over-correcting by stripping credit.** Recipeasly was pulled within hours in 2021 for removing authors' names and context ([Today](https://www.today.com/today/amp/tdna210423)). Always credit the source (Nanna, a book, a chef) with `origin`/`source`.
- **Ad-like layouts.** Avoid interstitials, newsletter modals, sticky video, image carousels and "related recipe" grids inside the method.
- **Paywalled or account-walled basics.** BBC Good Food keeps Cook Mode for subscribers; Jamie Oliver hides some methods behind "find the recipe in the book". Every feature here works without an account.
- **Silent scaling.** Never scale without a visible indicator, and never scale times or temperatures without saying so (NYT labels scaling as beta and untested).
- **Inconsistent scaling across views.** NYT's grocery list ignores the chosen scale. The shopping list, print, card and cook mode must all use the same state.
- **False precision.** "1.4999 cups", "1.33 eggs", "7.5 g salt" for a stew, or calories to the unit.
- **One cup-to-gram factor for everything.** Convert per food, or not at all; if a food has no density, show the original unit.
- **Read-only notes** (NYT) and notes that are lost on a cache clear without warning. Offer export.
- **Voice control and other gimmicks** that need microphone permission for marginal gain.
- **Using `HowToSection` for variants** in JSON-LD; Google says to use separate `Recipe` objects instead ([Google](https://developers.google.com/search/docs/appearance/structured-data/recipe)).
- **Autoplay video, infinite scroll and heavy hero images** that block first paint in a kitchen on mobile data.

---

## Schema changes suggested for `docs/RECIPE_FORMAT.md`

| Change | Why |
|---|---|
| `scale` adds `"seasoning"` and `"discrete"` (or `step: 1 \| 0.5` on counts) | range display; whole eggs |
| Ingredient `food` id (e.g. `"flour-00"`, `"egg"`) | density lookup, shopping-list merging, "what can I make", egg weights. Matching the free-text `item` is fragile. |
| Ingredient `each` weight (optional, defaults from the food table) | "1½ eggs (75 g)" |
| Recipe `precise: true` or `category: "baking"` | selects the finer rounding table and the egg rule |
| Replace `scalable: bool` with `scaling: { min?, max?, note? }` | warn rather than forbid |
| Recipe `pan: { shape, size, depth? }` | pan-size scaling |
| Recipe `yield` (e.g. `{ qty: 1, unit: "loaf" }`), separate from `servings` | JSON-LD `recipeYield` accepts several values; Cooklang has `yield` |
| Step `time: { active?, passive? }` (minutes), or derive it from `{timer}` | needed for "serve at" and for the cook-mode overview |
| Timer label: `{timer:12\|pasta}` | named, concurrent timers (Cooklang `~eggs{3%minutes}`) |
| Fractional references: `{@sugar*1/2}` | split ingredients across steps |
| `titleLocal`, `origin`/`source` | provenance and credit |
| Policy for `alt` | either drop it in favour of the density table, or keep it as an author override that wins over the table. Paprika had to add explicit support for scaling alternative measurements. |
