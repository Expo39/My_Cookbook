# Home: overrides

- **Opening:** the cookbook name in Bitter at display size, the subtitle (set in `web/src/routes/+page.svelte`), and the search field straight underneath. It is sized to its content, not 100vh.
- **Sections:**
  - one card per top-level section (First Courses, Main Courses, Soups, Desserts, Sides), with a 4 px primary rule along the top and the recipe count in a tint pill
  - subsections are listed inside each card as links
- **"Recently added":** the four newest recipe cards. Each card shows the innermost section as an accent eyebrow, the title (clamped to 2 lines), `titleLocal`, the summary (clamped to 2 lines), then a footer pinned to the bottom with total time and servings in `--font-num` and up to 2 tags as tint pills.
- **"Your recipes":** below the sections, once the device's recipes have loaded: a heading with an "Add a recipe" link, then the visitor's own recipe cards, each with a "Yours" eyebrow (device icon, tint pill). Section pages list the visitor's recipes for that section the same way. About once a week, while a visitor has recipes of their own, an export reminder sits under the heading: a surface panel with a 4 px accent edge and the alert icon ("Your recipes are only in this browser..."), a primary **Export** button that opens the format dialog, and a muted close cross ("Remind me next week"). Its text keeps to `--measure`.
- **Search page:** while nothing is typed, a tint "How to search" panel lists examples as white pill chips beside what each shows, in two aligned columns; a tap fills the box. A comma in the name search shows "Looks like a list of ingredients..." with a chip to switch to the ingredients search. The box's label carries an "i".
- **Grid:** every card grid uses `--card-grid` (`auto-fill`, `minmax(min(16rem, 100%), 1fr)`). Cards in a row share one height; titles scale with the card through container query units, and a card with a photo puts it beside the text once the card is 34rem wide.
- **Sections nav:** below 64rem it is a row of pill chips that scrolls sideways, fades at whichever end runs on, and centres the current section, which is filled with the primary colour. From 64rem up it is a row of underlined text links.
- **Breadcrumb:** the whole trail, wrapped rather than truncated. Below 40rem the current page is left out, because the title sits straight beneath it.
- **Header tools:** search (a slim pill on desktop), Favourites, Shopping list, How to use (help icon) and Settings. On a phone the logo and the five icons spread across the bar.
- **Mobile:** search sticks under the header once scrolled (`top: env(safe-area-inset-top)`).
