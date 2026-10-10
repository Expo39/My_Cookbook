use std::{collections::BTreeSet, fs, path::Path};

use scraper::{Html, Selector};
use serde_json::Value;

/// Collects every recipe id in the index, whatever the depth of the section tree.
fn indexed_ids(sections: &Value, ids: &mut Vec<String>) {
    for section in sections.as_array().into_iter().flatten() {
        for recipe in section["recipes"].as_array().into_iter().flatten() {
            if let Some(id) = recipe["id"].as_str() {
                ids.push(id.to_owned());
            }
        }
        indexed_ids(&section["sections"], ids);
    }
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text =
        fs::read_to_string(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{} is not valid JSON: {e}", path.display()))
}

fn recipe_json_ld(page: &Html) -> Result<Value, String> {
    let selector =
        Selector::parse(r#"script[type="application/ld+json"]"#).expect("static selector");
    let script = page.select(&selector).next().ok_or("no JSON-LD")?;
    let value: Value = serde_json::from_str(&script.text().collect::<String>())
        .map_err(|e| format!("invalid JSON-LD: {e}"))?;
    if value["@type"] != "Recipe" {
        return Err("the JSON-LD is not a Recipe".into());
    }
    let filled = |key: &str| value[key].as_array().is_some_and(|items| !items.is_empty());
    if value["name"].as_str().is_none_or(str::is_empty) {
        return Err("the JSON-LD has no name".into());
    }
    for key in ["recipeIngredient", "recipeInstructions"] {
        if !filled(key) {
            return Err(format!("the JSON-LD has no {key}"));
        }
    }
    Ok(value)
}

fn check_page(build: &Path, id: &str, searchable: &BTreeSet<&str>) -> Vec<String> {
    let mut problems = Vec::new();
    let page_path = build.join(format!("{id}.html"));
    match fs::read_to_string(&page_path) {
        Err(_) => problems.push("not pre-rendered".to_owned()),
        Ok(html) => {
            let page = Html::parse_document(&html);
            if let Err(problem) = recipe_json_ld(&page) {
                problems.push(problem);
            }
            let og = Selector::parse(r#"meta[property="og:image"]"#).expect("static selector");
            let linked = page
                .select(&og)
                .filter_map(|m| m.value().attr("content"))
                .any(|content| content.ends_with(&format!("/cards/{id}/og.png")));
            if !linked {
                problems.push("no og:image pointing at its card".to_owned());
            }
        }
    }
    if !searchable.contains(id) {
        problems.push("missing from the search index".to_owned());
    }
    if !build.join("cards").join(id).join("og.png").is_file() {
        problems.push("no Open Graph card".to_owned());
    }
    problems
}

/// Checks a built site against the recipe tree; returns the problems found, empty when it is sound.
pub fn run(root: &Path, build: &Path) -> Result<Vec<String>, String> {
    let loaded =
        cookbook_tree::load(root).map_err(|e| format!("cannot read {}: {e}", root.display()))?;
    let expected: BTreeSet<String> = loaded.collection.recipes.iter().map(|r| r.id()).collect();

    let data = build.join("data");
    let mut listed = Vec::new();
    indexed_ids(
        &read_json(&data.join("index.json"))?["sections"],
        &mut listed,
    );
    let listed: BTreeSet<String> = listed.into_iter().collect();

    let search = read_json(&data.join("search.json"))?;
    let searchable: BTreeSet<&str> = search["docs"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|doc| doc["id"].as_str())
        .collect();

    let mut problems = Vec::new();
    if listed.len() != expected.len() {
        problems.push(format!(
            "the index lists {} recipes for {} recipe files",
            listed.len(),
            expected.len()
        ));
    }
    for id in expected.symmetric_difference(&listed) {
        problems.push(format!(
            "{id}: differs between the index and the recipe files"
        ));
    }
    for id in &expected {
        problems.extend(
            check_page(build, id, &searchable)
                .into_iter()
                .map(|problem| format!("{id}: {problem}")),
        );
    }
    Ok(problems)
}
