use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use cookbook_core::{
    CheckResult, Collection, RecipeFile, Site, build_site, check_all, has_errors, site::Manifest,
};
use serde::Serialize;

use crate::report::Report;

#[derive(Debug)]
pub enum BuildError {
    /// The checklist found errors; the report is ready to print.
    Check(String),
    Other(String),
}

impl From<io::Error> for BuildError {
    fn from(error: io::Error) -> Self {
        BuildError::Other(error.to_string())
    }
}

impl From<serde_json::Error> for BuildError {
    fn from(error: serde_json::Error) -> Self {
        BuildError::Other(error.to_string())
    }
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), BuildError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec(value)?)?;
    Ok(())
}

/// `SOURCE_DATE_EPOCH` makes the timestamp reproducible.
fn build_time() -> String {
    let seconds = std::env::var("SOURCE_DATE_EPOCH")
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.as_secs() as i64)
        });
    rfc3339(seconds)
}

/// Civil-from-days conversion (Howard Hinnant's algorithm), to avoid a date dependency.
fn rfc3339(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let rest = seconds.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

fn count_json(dir: &Path) -> io::Result<usize> {
    let mut count = 0;
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            count += count_json(&entry.path())?;
        } else if entry.path().extension().is_some_and(|e| e == "json") {
            count += 1;
        }
    }
    Ok(count)
}

fn recipe_files_in_tree(collection: &Collection) -> usize {
    collection
        .files
        .iter()
        .filter(|f| f.ends_with(".json") && !f.ends_with("_section.json"))
        .count()
}

fn verify(out: &Path, collection: &Collection, site: &Site) -> Result<(), BuildError> {
    let emitted = count_json(&out.join("recipes"))?;
    let expected = recipe_files_in_tree(collection);
    if emitted != expected {
        return Err(BuildError::Other(format!(
            "self-check failed: {emitted} recipe files emitted for {expected} in the tree"
        )));
    }
    let indexed: std::collections::BTreeSet<&str> = site.search.ids().collect();
    if let Some(missing) = site
        .recipes
        .keys()
        .find(|id| !indexed.contains(id.as_str()))
    {
        return Err(BuildError::Other(format!(
            "self-check failed: '{missing}' is missing from the search index"
        )));
    }
    Ok(())
}

pub struct Built {
    pub count: usize,
    pub warnings: Vec<CheckResult>,
}

pub fn run(root: &Path, out: &Path) -> Result<Built, BuildError> {
    if !cookbook_tree::has_recipes(root) {
        return Err(BuildError::Other(format!(
            "no recipes in {}",
            root.display()
        )));
    }
    let loaded = cookbook_tree::load(root)?;
    let mut subjects: Vec<String> = loaded
        .collection
        .recipes
        .iter()
        .map(RecipeFile::id)
        .collect();
    subjects.extend(loaded.collection.unparsed.iter().cloned());
    subjects.sort();
    let results: Vec<CheckResult> = check_all(&loaded.collection)
        .into_iter()
        .chain(loaded.parse_errors)
        .collect();
    if has_errors(&results) {
        return Err(BuildError::Check(Report::new(subjects, results).text()));
    }
    let warnings = results;

    let site = build_site(&loaded.collection);
    let recipes_dir: PathBuf = out.join("recipes");
    match fs::remove_dir_all(&recipes_dir) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error.into()),
        _ => {}
    }
    for (id, data) in &site.recipes {
        write_json(&recipes_dir.join(format!("{id}.json")), data)?;
    }
    write_json(&out.join("index.json"), &site.index)?;
    write_json(&out.join("search.json"), &site.search)?;
    let ids: Vec<String> = site.recipes.keys().cloned().collect();
    write_json(
        &out.join("manifest.json"),
        &Manifest {
            count: ids.len(),
            ids,
            built_at: build_time(),
        },
    )?;
    verify(out, &loaded.collection, &site)?;
    Ok(Built {
        count: site.recipes.len(),
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_the_epoch_and_a_leap_day() {
        assert_eq!(rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339(1_709_210_096), "2024-02-29T12:34:56Z");
    }
}
