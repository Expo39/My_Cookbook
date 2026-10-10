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

#[cfg(test)]
mod tests {
    use super::*;

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
