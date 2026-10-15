# Home: overrides

- **Opening:** the cookbook name in Bitter at display size, the subtitle (set in `web/src/routes/+page.svelte`), and the search field straight underneath. It is sized to its content, not 100vh.
- **Sections:**
  - one card per top-level section (First Courses, Main Courses, Soups, Desserts, Sides), with a 4 px primary rule along the top and the recipe count in a tint pill
  - subsections are listed inside each card as links
- **"Recently added":** the four newest recipe cards. Each card shows the innermost section as an accent eyebrow, the title (clamped to 2 lines), `titleLocal`, the summary (clamped to 2 lines), then a footer pinned to the bottom with total time and servings in `--font-num` and up to 2 tags as tint pills.
- **Grid:** every card grid uses `--card-grid` (`auto-fill`, `minmax(min(16rem, 100%), 1fr)`). Cards in a row share one height; titles scale with the card through container query units, and a card with a photo puts it beside the text once the card is 34rem wide.
- **Sections nav:** below 64rem it is a row of pill chips that scrolls sideways, fades at whichever end runs on, and centres the current section, which is filled with the primary colour. From 64rem up it is a row of underlined text links.
- **Breadcrumb:** the whole trail, wrapped rather than truncated. Below 40rem the current page is left out, because the title sits straight beneath it.
- **Mobile:** search sticks under the header once scrolled (`top: env(safe-area-inset-top)`).
