//! One-off conversion of the legacy `index.html` into the `recipes/` tree.

mod ingredient;
pub mod legacy_ids;

use std::{collections::BTreeMap, fs, path::Path};

use cookbook_core::{
    Amount, Ingredient, IngredientGroup, Qty, Recipe, Section, Step, Unit, Variant, VariantOption,
};
use ingredient::{Line, plain_text};
use scraper::{ElementRef, Html, Selector};

/// The content calls this subsection "Miscellaneous"; the table of contents calls it "Platters".
const RENAMED_SUBSECTIONS: &[(&str, &str)] = &[("Miscellaneous", "Platters")];

const VANILLA_KEY: &str = "vanilla";
const VANILLA_STEP_KEY: &str = "infuse";

// The wording of the legacy `updateVanillaType()`.
const EXTRACT_STEP: &str = "Pour cream into saucepan, heat until just starts to simmer. Remove immediately. Stir in vanilla extract. Let cool to lukewarm (15-20 minutes).";
const ESSENCE_STEP: &str = "Pour cream into saucepan, heat until just starts to simmer. Remove immediately. Stir in vanilla essence. Let cool to lukewarm (15-20 minutes).";
const ESSENCE_TIP: &str = "Vanilla essence is more concentrated than extract, so use less. Water bath prevents custard from curdling. The wobble test is key - center should jiggle like jelly when gently shaken.";
const PODS_STEP: &str = "Split vanilla pod lengthwise and scrape out seeds. Pour cream into saucepan with vanilla pod and seeds, heat until just starts to simmer. Remove from heat, let infuse 15 minutes. Remove pod, reheat gently if needed. Let cool to lukewarm.";
const PODS_TIP: &str = "Vanilla pods give the most authentic flavour with beautiful vanilla specks throughout. After removing the pod, you can rinse and dry it to make vanilla sugar. Water bath prevents custard from curdling. The wobble test is key - center should jiggle like jelly when gently shaken.";

pub struct Migrated {
    /// Folder (relative to the output root) and its `_section.json`.
    pub sections: Vec<(String, Section)>,
    /// Recipe id (path without extension) and the recipe.
    pub recipes: Vec<(String, Recipe)>,
}

fn selector(css: &str) -> Selector {
    Selector::parse(css).expect("the selectors in this module are valid")
}

fn fold(c: char) -> Option<char> {
    Some(match c {
        'à' | 'á' | 'â' | 'ä' => 'a',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ò' | 'ó' | 'ô' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ç' | 'ċ' => 'c',
        c if c.is_ascii_alphanumeric() => c,
        _ => return None,
    })
}

pub fn slugify(text: &str) -> String {
    let mut slug = String::new();
    let mut gap = false;
    for c in text.to_lowercase().chars() {
        if matches!(c, '\'' | '’') {
            continue;
        }
        match fold(c) {
            Some(c) => {
                if gap && !slug.is_empty() {
                    slug.push('-');
                }
                gap = false;
                slug.push(c);
            }
            None => gap = true,
        }
    }
    slug
}

fn has_class(element: ElementRef, class: &str) -> bool {
    element
        .value()
        .has_class(class, scraper::CaseSensitivity::CaseSensitive)
}

/// Legacy recipe id to tag, from the table of contents. The content's own tag
/// banners cannot be used: they place the gnocchi after "Creamy & Rich".
fn contents_tags(doc: &Html) -> BTreeMap<String, String> {
    let mut tags = BTreeMap::new();
    for list in doc.select(&selector(".toc ul")) {
        let mut tag: Option<String> = None;
        for li in list.select(&selector("li")) {
            if has_class(li, "subsection-item") {
                tag = Some(plain_text(li));
            } else if let (Some(tag), Some(link)) = (&tag, li.select(&selector("a")).next())
                && let Some(id) = link.value().attr("href").and_then(|h| h.strip_prefix('#'))
            {
                tags.insert(id.to_owned(), tag.clone());
            }
        }
    }
    tags
}

fn related_ids(recipe: ElementRef, own: &str) -> Result<Vec<String>, String> {
    let mut related: Vec<String> = Vec::new();
    for link in recipe.select(&selector("a[href^='#']")) {
        let target = link
            .value()
            .attr("href")
            .unwrap_or_default()
            .trim_start_matches('#');
        let found = legacy_ids::lookup(target)
            .ok_or_else(|| format!("{own}: link to unknown recipe '{target}'"))?;
        if target != own && !related.iter().any(|id| id == found.id) {
            related.push(found.id.to_owned());
        }
    }
    Ok(related)
}

fn ingredient_groups(recipe: ElementRef, legacy: &str) -> Result<Vec<IngredientGroup>, String> {
    let container = recipe
        .select(&selector("div.ingredients"))
        .next()
        .ok_or_else(|| format!("{legacy}: no ingredients"))?;
    let mut groups: Vec<IngredientGroup> = Vec::new();
    for child in container.children().filter_map(ElementRef::wrap) {
        match child.value().name() {
            "p" => {
                let (name, total) = ingredient::parse_heading(child)?;
                groups.push(IngredientGroup {
                    name: Some(name),
                    total,
                    items: Vec::new(),
                });
            }
            "ul" => {
                for li in child.children().filter_map(ElementRef::wrap) {
                    match ingredient::parse_line(li).map_err(|e| format!("{legacy}: {e}"))? {
                        Line::Heading(name) => groups.push(IngredientGroup {
                            name: Some(name),
                            total: None,
                            items: Vec::new(),
                        }),
                        Line::Item(mut item) => {
                            if li.value().id() == Some("vanilla-ingredient") {
                                item.key = Some(VANILLA_KEY.to_owned());
                            }
                            if groups.is_empty() {
                                groups.push(IngredientGroup {
                                    name: None,
                                    total: None,
                                    items: Vec::new(),
                                });
                            }
                            if let Some(group) = groups.last_mut() {
                                group.items.push(*item);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    if groups.is_empty() || groups.iter().any(|g| g.items.is_empty()) {
        return Err(format!("{legacy}: an ingredient group is empty"));
    }
    Ok(groups)
}

fn vanilla_variant(base: &Recipe) -> Result<Variant, String> {
    let base_ok = base.find_ingredient(VANILLA_KEY).is_some_and(|i| {
        i.item.as_deref() == Some("vanilla extract")
            && i.amount
                .as_ref()
                .is_some_and(|a| a.qty == Qty::Single(2.0) && a.unit == Some(Unit::Tsp))
    }) && base
        .steps
        .iter()
        .any(|s| s.key.as_deref() == Some(VANILLA_STEP_KEY) && s.text == EXTRACT_STEP);
    if !base_ok {
        return Err(
            "brulee: the page no longer matches the extract option of updateVanillaType()".into(),
        );
    }
    let tsp = |qty: f64| Amount {
        qty: Qty::Single(qty),
        unit: Some(Unit::Tsp),
    };
    let option =
        |key: &str, label: &str, ingredient: Ingredient, step: &str, tip: &str| VariantOption {
            key: key.to_owned(),
            label: label.to_owned(),
            default: None,
            ingredients: BTreeMap::from([(VANILLA_KEY.to_owned(), ingredient)]),
            steps: BTreeMap::from([(VANILLA_STEP_KEY.to_owned(), step.to_owned())]),
            tips: Some(vec![tip.to_owned()]),
        };
    Ok(Variant {
        key: VANILLA_KEY.to_owned(),
        label: "Vanilla".to_owned(),
        options: vec![
            VariantOption {
                key: "extract".to_owned(),
                label: "Extract".to_owned(),
                default: Some(true),
                ingredients: BTreeMap::new(),
                steps: BTreeMap::new(),
                tips: None,
            },
            option(
                "essence",
                "Essence",
                ingredient::build(Some(tsp(1.5)), None, None, "vanilla essence"),
                ESSENCE_STEP,
                ESSENCE_TIP,
            ),
            option(
                "pods",
                "Pods",
                ingredient::build(
                    Some(Amount {
                        qty: Qty::Single(1.0),
                        unit: None,
                    }),
                    None,
                    None,
                    "vanilla pod, split and scraped",
                ),
                PODS_STEP,
                PODS_TIP,
            ),
        ],
    })
}

fn convert(
    element: ElementRef,
    tag: Option<&String>,
    order: i32,
) -> Result<(String, Recipe), String> {
    let legacy = element.value().id().ok_or("a recipe has no id")?;
    let entry = legacy_ids::lookup(legacy).ok_or_else(|| format!("unknown recipe '{legacy}'"))?;
    let title = element
        .select(&selector("h2"))
        .next()
        .map(plain_text)
        .ok_or_else(|| format!("{legacy}: no title"))?;
    let summary = element
        .select(&selector(".recipe-intro"))
        .next()
        .map(plain_text)
        .ok_or_else(|| format!("{legacy}: no intro"))?;
    let mut steps: Vec<Step> = element
        .select(&selector(".method li"))
        .map(|li| Step {
            heading: None,
            text: plain_text(li),
            key: (li.value().id() == Some("vanilla-method-step"))
                .then(|| VANILLA_STEP_KEY.to_owned()),
            time: None,
        })
        .collect();
    if steps.is_empty() {
        steps.push(Step {
            heading: None,
            text: legacy_ids::NO_METHOD_STEP.to_owned(),
            key: None,
            time: None,
        });
    }
    let tips = element
        .select(&selector(".chef-tip p"))
        .map(plain_text)
        .collect();
    let mut recipe = Recipe {
        title,
        summary,
        servings: entry.servings,
        servings_noun: None,
        title_local: None,
        origin: None,
        scaling: None,
        precise: false,
        pan: None,
        times: None,
        difficulty: None,
        tags: tag.cloned().into_iter().collect(),
        order: Some(order),
        image: None,
        equipment: Vec::new(),
        ingredient_groups: ingredient_groups(element, legacy)?,
        steps,
        tips,
        variants: Vec::new(),
        related: related_ids(element, legacy)?,
    };
    if legacy == "brulee" {
        recipe.variants.push(vanilla_variant(&recipe)?);
    }
    Ok((entry.id.to_owned(), recipe))
}

pub fn migrate(html: &str) -> Result<Migrated, String> {
    let doc = Html::parse_document(html);
    let tags = contents_tags(&doc);
    let content = doc
        .select(&selector("div.content"))
        .next()
        .ok_or("no div.content")?;
    let mut sections: Vec<(String, Section)> = Vec::new();
    let mut recipes: Vec<(String, Recipe)> = Vec::new();
    let mut counters: BTreeMap<String, i32> = BTreeMap::new();
    let mut next = |parent: &str| {
        let counter = counters.entry(parent.to_owned()).or_insert(0);
        *counter += 1;
        *counter
    };
    let (mut section, mut subsection): (Option<String>, Option<String>) = (None, None);
    for child in content.children().filter_map(ElementRef::wrap) {
        if has_class(child, "section-header") {
            let title = plain_text(child);
            let folder = slugify(&title);
            sections.push((
                folder.clone(),
                Section {
                    title,
                    order: Some(next("")),
                    summary: None,
                },
            ));
            (section, subsection) = (Some(folder), None);
        } else if has_class(child, "subsection-header") {
            let parent = section
                .clone()
                .ok_or("a subsection comes before any section")?;
            let mut title = plain_text(child);
            if let Some((_, renamed)) = RENAMED_SUBSECTIONS.iter().find(|(from, _)| *from == title)
            {
                title = (*renamed).to_owned();
            }
            let folder = format!("{parent}/{}", slugify(&title));
            sections.push((
                folder.clone(),
                Section {
                    title,
                    order: Some(next(&parent)),
                    summary: None,
                },
            ));
            subsection = Some(folder);
        } else if has_class(child, "recipe") {
            let folder = subsection
                .clone()
                .or_else(|| section.clone())
                .ok_or("a recipe comes before any section")?;
            let legacy = child.value().id().unwrap_or_default();
            let (id, recipe) = convert(child, tags.get(legacy), next(&format!("{folder}/")))?;
            let expected = format!("{folder}/{}", slugify(&recipe.title));
            if id != expected {
                return Err(format!(
                    "{legacy}: legacy_ids says '{id}' but the content gives '{expected}'"
                ));
            }
            recipes.push((id, recipe));
        }
    }
    if recipes.len() != legacy_ids::LEGACY_RECIPES.len() {
        return Err(format!(
            "found {} recipes, expected {}",
            recipes.len(),
            legacy_ids::LEGACY_RECIPES.len()
        ));
    }
    Ok(Migrated { sections, recipes })
}

fn write(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    fs::write(path, text).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn run(html_path: &Path, out: &Path) -> Result<String, String> {
    let html =
        fs::read_to_string(html_path).map_err(|e| format!("{}: {e}", html_path.display()))?;
    let migrated = migrate(&html)?;
    for (folder, section) in &migrated.sections {
        write(
            &out.join(folder).join("_section.json"),
            &cookbook_tree::render_json(section).map_err(|e| e.to_string())?,
        )?;
    }
    for (id, recipe) in &migrated.recipes {
        write(
            &out.join(format!("{id}.json")),
            &cookbook_tree::render_json(recipe).map_err(|e| e.to_string())?,
        )?;
    }
    Ok(format!(
        "wrote {} recipes and {} sections to {}",
        migrated.recipes.len(),
        migrated.sections.len(),
        out.display()
    ))
}

#[cfg(test)]
mod tests {
    use super::ingredient::normalise;
    use super::*;

    #[test]
    fn slugs_fold_accents_and_drop_punctuation() {
        assert_eq!(slugify("Crème Brûlée"), "creme-brulee");
        assert_eq!(slugify("Toni's Porchetta"), "tonis-porchetta");
        assert_eq!(slugify("Rice & Grain Bowls"), "rice-grain-bowls");
    }

    #[test]
    fn normalise_collapses_whitespace() {
        assert_eq!(normalise("  a \n  b\t"), "a b");
    }
}
