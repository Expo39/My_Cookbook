# Home: overrides

- **Opening:** the cookbook name in Bitter at display size, the subtitle "Antonio's recipes from a Maltese kitchen", and the search field straight underneath. It is sized to its content, not 100vh.
- **Sections:**
  - one card per top-level section (First Courses, Main Courses, Soups, Desserts, Sides), with the recipe count in `--font-num`
  - subsections are listed inside each card as links
- **"Recently added":** a 3-up row of recipe cards (one column on mobile). Each card shows the title, `titleLocal`, total time in `--font-num` and up to 2 tags.
- **Grid:** auto-fit, `minmax(18rem, 1fr)`. Cards share edges and padding, and their height is set by their content.
- **Mobile:** search sticks under the header once scrolled (`top: env(safe-area-inset-top)`).
