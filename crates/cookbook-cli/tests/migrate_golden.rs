//! Runs the legacy migration on the real `index.html` and checks that nothing is lost.

#[allow(dead_code)]
#[path = "../src/migrate/legacy_ids.rs"]
mod legacy_ids;

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

use cookbook_core::{Amount, Qty, Recipe, parse_recipe};
use legacy_ids::{LEGACY_RECIPES, NO_METHOD_STEP};
use scraper::{ElementRef, Html, Selector};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn selector(css: &str) -> Selector {
    Selector::parse(css).unwrap()
}

fn normalise(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn text_of(element: ElementRef) -> String {
    normalise(&element.text().collect::<String>())
}

fn read_tree(dir: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(base: &Path, dir: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(base, &path, files);
            } else {
                let rel = path
                    .strip_prefix(base)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                files.insert(rel, fs::read(&path).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(dir, dir, &mut files);
    files
}

/// The migration runs once for every test in this file.
fn migrated() -> &'static BTreeMap<String, Vec<u8>> {
    static TREE: OnceLock<BTreeMap<String, Vec<u8>>> = OnceLock::new();
    TREE.get_or_init(|| {
        let out = std::env::temp_dir().join(format!("cookbook-migrate-{}", std::process::id()));
        let _ = fs::remove_dir_all(&out);
        let status = Command::new(env!("CARGO_BIN_EXE_cookbook-cli"))
            .arg("migrate-legacy")
            .arg(root().join("index.html"))
            .arg("--out")
            .arg(&out)
            .output()
            .unwrap();
        assert!(
            status.status.success(),
            "{}",
            String::from_utf8_lossy(&status.stderr)
        );
        let tree = read_tree(&out);
        fs::remove_dir_all(&out).unwrap();
        tree
    })
}

fn parse_tree(tree: &BTreeMap<String, Vec<u8>>) -> BTreeMap<String, Recipe> {
    tree.iter()
        .filter(|(path, _)| !path.ends_with("_section.json"))
        .map(|(path, bytes)| {
            let id = path.strip_suffix(".json").unwrap().to_owned();
            let recipe = parse_recipe(std::str::from_utf8(bytes).unwrap()).unwrap();
            (id, recipe)
        })
        .collect()
}

/// The migration output.
fn recipes() -> BTreeMap<String, Recipe> {
    parse_tree(migrated())
}

/// The committed `recipes/` tree, which has been copy-edited since the migration.
fn committed() -> BTreeMap<String, Recipe> {
    parse_tree(&read_tree(&root().join("recipes")))
}

/// Recipes renamed after the migration: (migrated id, committed id).
const RENAMED: &[(&str, &str)] = &[(
    "main-courses/rice-grain-bowls/korean-ground-beef-bowl",
    "main-courses/rice-grain-bowls/korean-beef-mince-bowl",
)];

fn legacy_page() -> Html {
    Html::parse_document(&fs::read_to_string(root().join("index.html")).unwrap())
}

/// Each legacy recipe with its migrated counterpart.
fn pairs<'a>(
    page: &'a Html,
    migrated: &'a BTreeMap<String, Recipe>,
) -> Vec<(ElementRef<'a>, &'a Recipe, &'static str, &'static str)> {
    page.select(&selector("div.recipe"))
        .map(|element| {
            let legacy = element.value().id().unwrap();
            let entry = LEGACY_RECIPES.iter().find(|r| r.legacy == legacy).unwrap();
            let recipe = migrated.get(entry.id).unwrap_or_else(|| {
                let (_, renamed) = RENAMED.iter().find(|(from, _)| *from == entry.id).unwrap();
                &migrated[*renamed]
            });
            (element, recipe, entry.legacy, entry.id)
        })
        .collect()
}

fn is_group_heading(li: ElementRef) -> bool {
    li.select(&selector("strong"))
        .next()
        .is_some_and(|s| text_of(s) == text_of(li))
}

fn values(amount: &Amount) -> Vec<f64> {
    match amount.qty {
        Qty::Single(q) => vec![q],
        Qty::Range(r) => vec![r.min, r.max, (r.min + r.max) / 2.0],
    }
}

#[test]
fn migrates_all_nineteen_recipes() {
    let recipes = recipes();
    assert_eq!(recipes.len(), 19);
    assert_eq!(LEGACY_RECIPES.len(), 19);
    assert_eq!(legacy_page().select(&selector("div.recipe")).count(), 19);
}

struct LegacyCounts {
    ingredients: usize,
    steps: usize,
    tips: usize,
}

fn legacy_counts(element: ElementRef) -> LegacyCounts {
    LegacyCounts {
        ingredients: element
            .select(&selector(".ingredients li"))
            .filter(|li| !is_group_heading(*li))
            .count(),
        steps: element.select(&selector(".method li")).count().max(1),
        tips: element.select(&selector(".chef-tip p")).count(),
    }
}

#[test]
fn counts_match_the_legacy_page() {
    let (page, recipes) = (legacy_page(), recipes());
    for (element, recipe, legacy, _) in pairs(&page, &recipes) {
        let want = legacy_counts(element);
        assert_eq!(
            recipe.ingredients().count(),
            want.ingredients,
            "{legacy}: ingredients"
        );
        assert_eq!(recipe.steps.len(), want.steps, "{legacy}: steps");
        assert_eq!(recipe.tips.len(), want.tips, "{legacy}: tips");
    }
}

/// Edits may reword everything and add ingredients, steps or tips, but never lose what the
/// legacy page had.
#[test]
fn committed_recipes_keep_the_legacy_counts() {
    let (page, committed) = (legacy_page(), committed());
    assert_eq!(committed.len(), 19);
    for (element, recipe, legacy, _) in pairs(&page, &committed) {
        let want = legacy_counts(element);
        assert!(
            recipe.ingredients().count() >= want.ingredients,
            "{legacy}: ingredients"
        );
        assert!(recipe.steps.len() >= want.steps, "{legacy}: steps");
        assert!(recipe.tips.len() >= want.tips, "{legacy}: tips");
    }
}

fn assert_amounts_survive(recipes: &BTreeMap<String, Recipe>) {
    let page = legacy_page();
    for (element, recipe, legacy, _) in pairs(&page, recipes) {
        let mut found: Vec<f64> = Vec::new();
        for group in &recipe.ingredient_groups {
            found.extend(group.total.iter().flat_map(values));
            for item in &group.items {
                found.extend(item.amount.iter().chain(&item.alt).flat_map(values));
            }
        }
        for span in element.select(&selector(".ingredients [data-base]")) {
            let base: f64 = span.value().attr("data-base").unwrap().parse().unwrap();
            assert!(
                found.iter().any(|v| (v - base).abs() < 1e-9),
                "{legacy}: base {base} ({}) is missing",
                text_of(span)
            );
        }
    }
}

#[test]
fn every_legacy_amount_survives() {
    assert_amounts_survive(&recipes());
}

#[test]
fn every_legacy_amount_survives_the_copy_edit() {
    assert_amounts_survive(&committed());
}

/// The migrator's own output keeps the legacy wording. The committed tree has been copy-edited,
/// so this checks the migration only.
#[test]
fn every_legacy_step_and_tip_keeps_its_text() {
    let (page, recipes) = (legacy_page(), recipes());
    for (element, recipe, legacy, _) in pairs(&page, &recipes) {
        let steps: Vec<String> = element
            .select(&selector(".method li"))
            .map(text_of)
            .collect();
        let migrated: Vec<&str> = recipe.steps.iter().map(|s| s.text.as_str()).collect();
        if steps.is_empty() {
            assert_eq!(migrated, [NO_METHOD_STEP], "{legacy}");
        } else {
            assert_eq!(migrated, steps, "{legacy}");
        }
        let tips: Vec<String> = element
            .select(&selector(".chef-tip p"))
            .map(text_of)
            .collect();
        assert_eq!(recipe.tips, tips, "{legacy}: tips");
    }
}

#[test]
fn servings_follow_the_legacy_config() {
    let (page, recipes) = (legacy_page(), recipes());
    for (element, recipe, legacy, _) in pairs(&page, &recipes) {
        if let Some(input) = element.select(&selector("input[type=number]")).next() {
            let shown: u32 = input.value().attr("value").unwrap().parse().unwrap();
            assert_eq!(recipe.servings, shown, "{legacy}");
        }
    }
}

#[test]
fn vanilla_variant_replaces_the_keyed_parts() {
    let recipe = &recipes()["desserts/french-classics/creme-brulee"];
    assert!(recipe.find_ingredient("vanilla").is_some());
    assert!(
        recipe
            .steps
            .iter()
            .any(|s| s.key.as_deref() == Some("infuse"))
    );
    let labels: Vec<_> = recipe.variants[0]
        .options
        .iter()
        .map(|o| o.label.as_str())
        .collect();
    assert_eq!(labels, ["Extract", "Essence", "Pods"]);
    assert_eq!(recipe.variants[0].options[0].default, Some(true));
}
