use std::{fs, io, path::Path};

use cookbook_core::{
    CheckResult, Collection, Level, RecipeFile, SectionFile, parse_recipe, parse_section,
};

pub struct Loaded {
    pub collection: Collection,
    /// Files that could not be read or did not match the schema.
    pub parse_errors: Vec<CheckResult>,
}

pub fn has_recipes(root: &Path) -> bool {
    fs::read_dir(root).is_ok_and(|mut entries| entries.next().is_some())
}

/// Reads the whole `recipes/` tree. This is the only place that touches the disc.
pub fn load(root: &Path) -> io::Result<Loaded> {
    let mut loaded = Loaded {
        collection: Collection::default(),
        parse_errors: Vec::new(),
    };
    walk(root, "", &mut loaded)?;
    Ok(loaded)
}

fn join(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        name.to_owned()
    } else {
        format!("{folder}/{name}")
    }
}

fn walk(dir: &Path, folder: &str, loaded: &mut Loaded) -> io::Result<()> {
    let mut entries: Vec<_> = fs::read_dir(dir)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let rel = join(folder, &name);
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            loaded.collection.folders.push(rel.clone());
            walk(&path, &rel, loaded)?;
            continue;
        }
        loaded.collection.files.insert(rel.clone());
        if name == "_section.json" {
            let parsed = parse_section(&fs::read_to_string(&path)?);
            match parsed {
                Ok(section) => loaded.collection.sections.push(SectionFile {
                    folder: folder.to_owned(),
                    section,
                }),
                Err(error) => loaded.parse_errors.push(parse_failure(folder, &error)),
            }
        } else if let Some(id) = rel.strip_suffix(".json") {
            match parse_recipe(&fs::read_to_string(&path)?) {
                Ok(recipe) => loaded
                    .collection
                    .recipes
                    .push(RecipeFile { path: rel, recipe }),
                Err(error) => {
                    loaded.collection.unparsed.push(id.to_owned());
                    loaded.parse_errors.push(parse_failure(id, &error));
                }
            }
        }
    }
    Ok(())
}

fn parse_failure(subject: &str, error: &serde_json::Error) -> CheckResult {
    CheckResult {
        id: "E-SCHEMA-PARSE",
        level: Level::Error,
        message: error.to_string(),
        path: "$".to_owned(),
        recipe: subject.to_owned(),
    }
}

/// Pretty JSON with a trailing newline and whole numbers written without `.0`, as the migration does.
pub fn render_json<T: serde::Serialize>(value: &T) -> Result<String, serde_json::Error> {
    let json = serde_json::to_string_pretty(value)?;
    Ok(trim_float_zeroes(&json) + "\n")
}

/// serde_json writes whole floats as `2.0`; this drops the `.0` outside strings.
pub fn trim_float_zeroes(json: &str) -> String {
    let chars: Vec<char> = json.chars().collect();
    let mut out = String::with_capacity(json.len());
    let (mut in_string, mut escaped) = (false, false);
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if in_string {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
        } else if c == '"' {
            in_string = true;
        } else if c == '.'
            && chars.get(i + 1) == Some(&'0')
            && !chars.get(i + 2).is_some_and(char::is_ascii_digit)
            && out.ends_with(|d: char| d.is_ascii_digit())
        {
            i += 2;
            continue;
        }
        out.push(c);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_floats_lose_their_decimal_point_outside_strings() {
        let text = r#"{"qty": 2.0, "x": 1.5, "s": "v2.0 and 3.0", "n": 10.0}"#;
        assert_eq!(
            trim_float_zeroes(text),
            r#"{"qty": 2, "x": 1.5, "s": "v2.0 and 3.0", "n": 10}"#
        );
    }

    #[test]
    fn missing_directory_has_no_recipes() {
        assert!(!has_recipes(Path::new("does-not-exist")));
    }

    #[test]
    fn joins_folders() {
        assert_eq!(join("", "a"), "a");
        assert_eq!(join("a/b", "c"), "a/b/c");
    }
}
