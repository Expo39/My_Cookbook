//! The data the static site consumes, derived from a loaded recipe tree.

use std::{cmp::Ordering, collections::BTreeMap};

use schemars::JsonSchema;
use serde::Serialize;

use crate::{
    checklist::Collection,
    scale::{ScaleOptions, ScaleRequest, ScaledRecipe, scale},
    schema::{Difficulty, Recipe},
    search::{RecipeSummary, SearchIndex},
};

/// Minutes, with the sum of whichever parts are present.
#[derive(Debug, Clone, Default, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TimesSummary {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prep: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cook: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rest: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u32>,
}

/// What the image pipeline measured and produced for one recipe photo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    /// The widths written to `static/img/<id>/`, ascending.
    pub widths: Vec<u32>,
}

/// A recipe photo as the web app needs it: alt text, the source's shape and the widths on offer.
#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CardImage {
    /// Relative to the `recipes/` root.
    pub src: String,
    pub alt: String,
    /// The source's size, so the page can reserve space before the photo loads.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    /// The widths of the generated files, ascending; empty until the pipeline has run.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub widths: Vec<u32>,
}

/// What a recipe card or list row needs without loading the recipe itself.
#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecipeCard {
    pub id: String,
    pub slug: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_local: Option<String>,
    pub summary: String,
    pub tags: Vec<String>,
    pub times: TimesSummary,
    pub servings: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub difficulty: Option<Difficulty>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<CardImage>,
    /// Titles of the sections the recipe sits in, outermost first.
    pub section: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SectionNode {
    /// The folder, relative to `recipes/`.
    pub path: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i32>,
    pub sections: Vec<SectionNode>,
    pub recipes: Vec<RecipeCard>,
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SiteIndex {
    pub sections: Vec<SectionNode>,
}

/// One `recipes/<id>.json` file: everything a recipe page needs to prerender.
#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecipeData {
    pub recipe: Recipe,
    /// The recipe at its written servings, in metric units, with the default variants.
    pub view: ScaledRecipe,
    pub section: Vec<String>,
    pub related: Vec<RecipeCard>,
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub count: usize,
    pub ids: Vec<String>,
    /// RFC 3339, UTC.
    pub built_at: String,
}

pub struct Site {
    pub index: SiteIndex,
    pub recipes: BTreeMap<String, RecipeData>,
    pub search: SearchIndex,
}

fn total_minutes(recipe: &Recipe) -> TimesSummary {
    let Some(times) = recipe.times else {
        return TimesSummary::default();
    };
    let parts = [times.prep, times.cook, times.rest];
    TimesSummary {
        prep: times.prep,
        cook: times.cook,
        rest: times.rest,
        total: parts
            .iter()
            .any(Option::is_some)
            .then(|| parts.iter().flatten().sum()),
    }
}

fn card(
    id: &str,
    recipe: &Recipe,
    section: &[String],
    images: &BTreeMap<String, ImageMeta>,
) -> RecipeCard {
    let folder = id.rsplit_once('/').map_or("", |(folder, _)| folder);
    let meta = images.get(id);
    RecipeCard {
        id: id.to_owned(),
        slug: id.rsplit('/').next().unwrap_or(id).to_owned(),
        title: recipe.title.clone(),
        title_local: recipe.title_local.clone(),
        summary: recipe.summary.clone(),
        tags: recipe.tags.clone(),
        times: total_minutes(recipe),
        servings: recipe.servings,
        difficulty: recipe.difficulty,
        image: recipe.image.as_ref().map(|image| CardImage {
            src: if folder.is_empty() {
                image.src.clone()
            } else {
                format!("{folder}/{}", image.src)
            },
            alt: image.alt.clone(),
            width: meta.map(|m| m.width),
            height: meta.map(|m| m.height),
            widths: meta.map(|m| m.widths.clone()).unwrap_or_default(),
        }),
        section: section.to_vec(),
    }
}

fn by_order(a: (Option<i32>, &str, &str), b: (Option<i32>, &str, &str)) -> Ordering {
    // Entries without an order sort after those with one.
    a.0.map_or((1, 0), |o| (0, o))
        .cmp(&b.0.map_or((1, 0), |o| (0, o)))
        .then_with(|| a.1.cmp(b.1))
        .then_with(|| a.2.cmp(b.2))
}

fn titles(collection: &Collection, folder: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for part in folder.split('/').filter(|p| !p.is_empty()) {
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(part);
        if let Some(section) = collection.sections.iter().find(|s| s.folder == current) {
            out.push(section.section.title.clone());
        }
    }
    out
}

fn node(
    collection: &Collection,
    cards: &[(String, Option<i32>, RecipeCard)],
    folder: &str,
) -> SectionNode {
    let file = collection
        .sections
        .iter()
        .find(|s| s.folder == folder)
        .expect("only known section folders are walked");
    let prefix = format!("{folder}/");
    let mut children: Vec<&crate::checklist::SectionFile> = collection
        .sections
        .iter()
        .filter(|s| {
            s.folder
                .strip_prefix(&prefix)
                .is_some_and(|rest| !rest.contains('/'))
        })
        .collect();
    children.sort_by(|a, b| {
        by_order(
            (a.section.order, &a.section.title, &a.folder),
            (b.section.order, &b.section.title, &b.folder),
        )
    });
    let mut recipes: Vec<&(String, Option<i32>, RecipeCard)> = cards
        .iter()
        .filter(|(id, _, _)| {
            id.strip_prefix(&prefix)
                .is_some_and(|rest| !rest.contains('/'))
        })
        .collect();
    recipes.sort_by(|a, b| by_order((a.1, &a.2.title, &a.0), (b.1, &b.2.title, &b.0)));
    SectionNode {
        path: folder.to_owned(),
        title: file.section.title.clone(),
        summary: file.section.summary.clone(),
        order: file.section.order,
        sections: children
            .iter()
            .map(|child| node(collection, cards, &child.folder))
            .collect(),
        recipes: recipes
            .into_iter()
            .map(|(_, _, card)| card.clone())
            .collect(),
    }
}

/// Derives the index, the per-recipe pages and the search index. The tree is assumed to have passed the checklist.
pub fn build_site(collection: &Collection) -> Site {
    build_site_with_images(collection, &BTreeMap::new())
}

/// Like [`build_site`], with the photo sizes the image pipeline measured, keyed by recipe id.
pub fn build_site_with_images(
    collection: &Collection,
    images: &BTreeMap<String, ImageMeta>,
) -> Site {
    let mut files: Vec<_> = collection.recipes.iter().collect();
    files.sort_by_key(|f| f.id());
    let cards: Vec<(String, Option<i32>, RecipeCard)> = files
        .iter()
        .map(|f| {
            let id = f.id();
            let folder = id.rsplit_once('/').map_or("", |(folder, _)| folder);
            let card = card(&id, &f.recipe, &titles(collection, folder), images);
            (id, f.recipe.order, card)
        })
        .collect();

    let mut roots: Vec<_> = collection
        .sections
        .iter()
        .filter(|s| !s.folder.contains('/') && !s.folder.is_empty())
        .collect();
    roots.sort_by(|a, b| {
        by_order(
            (a.section.order, &a.section.title, &a.folder),
            (b.section.order, &b.section.title, &b.folder),
        )
    });
    let index = SiteIndex {
        sections: roots
            .iter()
            .map(|root| node(collection, &cards, &root.folder))
            .collect(),
    };

    let recipes = files
        .iter()
        .zip(&cards)
        .map(|(file, (id, _, card))| {
            let related = file
                .recipe
                .related
                .iter()
                .filter_map(|r| cards.iter().find(|(other, _, _)| other == r))
                .map(|(_, _, card)| card.clone())
                .collect();
            let data = RecipeData {
                recipe: file.recipe.clone(),
                view: scale(
                    &file.recipe,
                    &ScaleRequest::Multiplier(1.0),
                    &ScaleOptions::default(),
                ),
                section: card.section.clone(),
                related,
            };
            (id.clone(), data)
        })
        .collect();

    let summaries: Vec<RecipeSummary> = files
        .iter()
        .zip(&cards)
        .map(|(file, (id, _, card))| RecipeSummary::from_recipe(id, &file.recipe, &card.section))
        .collect();
    Site {
        index,
        recipes,
        search: SearchIndex::build(&summaries),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        checklist::{RecipeFile, SectionFile},
        schema::{Image, Section, parse_recipe},
    };

    fn recipe(title: &str, extra: &str) -> Recipe {
        parse_recipe(&format!(
            r#"{{"title":"{title}","summary":"s","servings":2,{extra}
            "ingredientGroups":[{{"items":[{{"item":"rice","amount":{{"qty":100,"unit":"g"}}}}]}}],
            "steps":[{{"text":"Cook."}}]}}"#
        ))
        .expect("the fixture parses")
    }

    fn section(folder: &str, title: &str, order: Option<i32>) -> SectionFile {
        SectionFile {
            folder: folder.to_owned(),
            section: Section {
                title: title.to_owned(),
                order,
                summary: None,
            },
        }
    }

    fn collection() -> Collection {
        let mut c = Collection {
            sections: vec![
                section("mains", "Mains", Some(2)),
                section("mains/rice", "Rice", None),
                section("starters", "Starters", Some(1)),
            ],
            ..Collection::default()
        };
        let mut add = |path: &str, recipe: Recipe| {
            c.recipes.push(RecipeFile {
                path: path.to_owned(),
                recipe,
            });
        };
        add(
            "mains/rice/zesty.json",
            recipe("Zesty", r#""times":{"prep":5,"cook":10},"#),
        );
        add(
            "mains/rice/alpha.json",
            recipe("Alpha", r#""order":1,"related":["mains/rice/zesty"],"#),
        );
        add("starters/soup.json", recipe("Soup", ""));
        c
    }

    #[test]
    fn sections_and_recipes_follow_their_order() {
        let site = build_site(&collection());
        let titles: Vec<_> = site
            .index
            .sections
            .iter()
            .map(|s| s.title.as_str())
            .collect();
        assert_eq!(titles, ["Starters", "Mains"]);
        let rice = &site.index.sections[1].sections[0];
        assert_eq!(rice.path, "mains/rice");
        let order: Vec<_> = rice.recipes.iter().map(|r| r.slug.as_str()).collect();
        assert_eq!(order, ["alpha", "zesty"]);
        assert_eq!(rice.recipes[0].section, ["Mains", "Rice"]);
    }

    #[test]
    fn times_include_a_total() {
        let site = build_site(&collection());
        let zesty = &site.index.sections[1].sections[0].recipes[1];
        assert_eq!(zesty.times.total, Some(15));
        assert_eq!(site.index.sections[0].recipes[0].times.total, None);
    }

    #[test]
    fn pages_carry_a_view_and_their_related_cards() {
        let site = build_site(&collection());
        let page = &site.recipes["mains/rice/alpha"];
        assert_eq!(page.view.servings, 2.0);
        assert_eq!(page.related[0].id, "mains/rice/zesty");
        assert_eq!(site.search.ids().count(), 3);
        assert_eq!(site.recipes.len(), 3);
    }

    #[test]
    fn images_resolve_against_the_recipe_folder() {
        let mut c = collection();
        c.recipes[2].recipe.image = Some(Image {
            src: "soup.jpg".to_owned(),
            alt: "Soup".to_owned(),
        });
        let site = build_site(&c);
        let image = site.index.sections[0].recipes[0].image.as_ref().unwrap();
        assert_eq!(image.src, "starters/soup.jpg");
        assert_eq!((image.width, image.widths.len()), (None, 0));
    }

    #[test]
    fn measured_photos_reach_the_card() {
        let mut c = collection();
        c.recipes[2].recipe.image = Some(Image {
            src: "soup.jpg".to_owned(),
            alt: "Soup".to_owned(),
        });
        let images = BTreeMap::from([(
            "starters/soup".to_owned(),
            ImageMeta {
                width: 2000,
                height: 1500,
                widths: vec![480, 960, 1600],
            },
        )]);
        let site = build_site_with_images(&c, &images);
        let image = site.index.sections[0].recipes[0].image.as_ref().unwrap();
        assert_eq!((image.width, image.height), (Some(2000), Some(1500)));
        assert_eq!(image.widths, [480, 960, 1600]);
    }
}
