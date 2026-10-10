# cookbook-tree

Loads the `recipes/` folder from disc into a `cookbook_core::Collection`. It is the only code that reads the recipe tree, and it is shared by `cookbook-cli` and `cookbook-server` so that both see the tree the same way.

## Public surface

| Item | Purpose |
|---|---|
| `load(root) -> io::Result<Loaded>` | Walks the tree and parses every `_section.json` and recipe file. |
| `Loaded` | `collection`, holding the parsed recipes and sections, every folder and file, and the measured image widths; and `parse_errors`, a checklist result for each file that could not be read or did not match the schema. |
| `has_recipes(root) -> bool` | Whether the folder exists and has any entries. |
| `render_json(value)` | Pretty-prints JSON with a trailing newline and whole numbers without `.0`. |
| `trim_float_zeroes(json)` | Removes the `.0` that `serde_json` writes on whole floats, outside strings. |

## Tests

Unit tests sit in `src/lib.rs`; the crate is also covered by the CLI's and the server's integration tests.

```sh
cargo nextest run -p cookbook-tree
```
