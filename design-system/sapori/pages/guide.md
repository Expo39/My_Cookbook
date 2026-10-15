# How to use: overrides

- **Column:** the reading column (`--measure`), with an intro (display title and a muted lede), the walkthrough video, a contents panel, then one section per topic with h2 and h3 subheadings.
- **Contents:** a surface panel with an uppercase label and bold links. From 64rem it moves into a 16rem sticky column beside the text.
- **Video:** `<video controls preload="none">` at 16:10 with a poster and an English captions track, on a tint ground with a `--radius-m` border. It is recorded by `make walkthrough` and kept out of the service worker's precache.
- **Numbered steps:** the token steps use tint circles with `--font-num` numerals, set by CSS counters (the reset removes list markers).
- **Code and keys:** `kbd` and `code` sit in small tint boxes with a line border.
