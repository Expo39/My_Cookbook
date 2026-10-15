use std::collections::{BTreeMap, BTreeSet};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    scale::{ScaleOptions, ScaleRequest, scale},
    schema::{Amount, Ingredient, Qty, Recipe, Section, Unit},
    tokens::{Segment, parse_tokens},
    units::{UnitSystem, convert, unit_options},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
pub struct CheckResult {
    /// A stable code such as `E-TOKEN-UNRESOLVED`.
    pub id: &'static str,
    pub level: Level,
    pub message: String,
    /// Where in the recipe JSON the problem sits, e.g. `steps[2].text`.
    pub path: String,
    /// The recipe id, or the folder for section-level results.
    pub recipe: String,
}

pub fn has_errors(results: &[CheckResult]) -> bool {
    results.iter().any(|r| r.level == Level::Error)
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct RecipeFile {
    /// Relative to `recipes/`, e.g. `first-courses/pasta/one-pot-pasta.json`.
    pub path: String,
    pub recipe: Recipe,
}

impl RecipeFile {
    pub fn id(&self) -> String {
        self.path
            .strip_suffix(".json")
            .unwrap_or(&self.path)
            .to_owned()
    }

    fn folder(&self) -> &str {
        self.path.rsplit_once('/').map_or("", |(folder, _)| folder)
    }
}

#[derive(Debug, Clone)]
pub struct SectionFile {
    /// The folder holding `_section.json`, relative to `recipes/`.
    pub folder: String,
    pub section: Section,
}

#[derive(Debug, Clone, Default)]
pub struct Collection {
    pub recipes: Vec<RecipeFile>,
    pub sections: Vec<SectionFile>,
    /// Every folder found under `recipes/`, with or without a section file.
    pub folders: Vec<String>,
    /// Every file found, for image existence checks.
    pub files: BTreeSet<String>,
    /// Pixel widths of the image files that could be measured.
    pub image_widths: BTreeMap<String, u32>,
    /// Ids of recipe files that failed to parse, so links to them are not reported as dangling.
    pub unparsed: Vec<String>,
}

/// What a single-recipe check needs to know about the rest of the collection.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase")]
pub struct CheckContext {
    pub known_ids: BTreeSet<String>,
    pub section_folders: BTreeSet<String>,
    /// `None` skips the image existence check.
    pub files: Option<BTreeSet<String>>,
    /// Pixel widths of the image files, by path relative to `recipes/`; a missing entry skips the size check.
    pub image_widths: BTreeMap<String, u32>,
}

impl Collection {
    pub fn context(&self) -> CheckContext {
        CheckContext {
            known_ids: self
                .recipes
                .iter()
                .map(RecipeFile::id)
                .chain(self.unparsed.iter().cloned())
                .collect(),
            section_folders: self.sections.iter().map(|s| s.folder.clone()).collect(),
            files: Some(self.files.clone()),
            image_widths: self.image_widths.clone(),
        }
    }
}

fn is_slug(segment: &str) -> bool {
    !segment.is_empty()
        && segment.split('-').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

fn is_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

fn resolve_relative(folder: &str, src: &str) -> String {
    let mut parts: Vec<&str> = folder.split('/').filter(|p| !p.is_empty()).collect();
    for segment in src.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    parts.join("/")
}

/// The formats the image pipeline can read.
pub const IMAGE_FORMATS: &[&str] = &["jpg", "jpeg", "png", "webp"];

/// Narrower photos are warned about, because the largest generated width is 1600 px.
pub const MIN_IMAGE_WIDTH: u32 = 1200;

const AMERICAN: &[(&str, &str)] = &[
    ("color", "colour"),
    ("colors", "colours"),
    ("colored", "coloured"),
    ("coloring", "colouring"),
    ("colorful", "colourful"),
    ("flavor", "flavour"),
    ("flavors", "flavours"),
    ("flavored", "flavoured"),
    ("flavoring", "flavouring"),
    ("flavorful", "flavourful"),
    ("center", "centre"),
    ("centers", "centres"),
    ("centered", "centred"),
    ("favorite", "favourite"),
    ("favorites", "favourites"),
    ("gray", "grey"),
    ("liter", "litre"),
    ("liters", "litres"),
    ("meter", "metre"),
    ("meters", "metres"),
    ("fiber", "fibre"),
    ("caramelize", "caramelise"),
    ("caramelized", "caramelised"),
    ("caramelizes", "caramelises"),
    ("caramelizing", "caramelising"),
    ("aluminum", "aluminium"),
    ("mold", "mould"),
    ("yogurt", "yoghurt"),
    ("eggplant", "aubergine"),
    ("zucchini", "courgette"),
    ("arugula", "rocket"),
    ("cilantro", "coriander"),
    ("scallion", "spring onion"),
    ("scallions", "spring onions"),
];

const LEAVENERS: &[&str] = &[
    "baking-powder",
    "bicarbonate-of-soda",
    "baking-soda",
    "yeast",
    "instant-yeast",
    "dried-yeast",
    "cream-of-tartar",
];

struct Checker<'a> {
    recipe: &'a Recipe,
    subject: String,
    out: Vec<CheckResult>,
}

impl Checker<'_> {
    fn push(
        &mut self,
        id: &'static str,
        level: Level,
        path: impl Into<String>,
        message: impl Into<String>,
    ) {
        self.out.push(CheckResult {
            id,
            level,
            message: message.into(),
            path: path.into(),
            recipe: self.subject.clone(),
        });
    }

    fn error(&mut self, id: &'static str, path: impl Into<String>, message: impl Into<String>) {
        self.push(id, Level::Error, path, message);
    }

    fn warn(&mut self, id: &'static str, path: impl Into<String>, message: impl Into<String>) {
        self.push(id, Level::Warning, path, message);
    }

    fn amount(&mut self, path: &str, amount: &Amount) {
        let (min, max) = (amount.qty.min(), amount.qty.max());
        if !min.is_finite() || !max.is_finite() || min <= 0.0 {
            self.error(
                "E-QTY-POSITIVE",
                format!("{path}.qty"),
                "quantities must be numbers above zero",
            );
        } else if matches!(amount.qty, Qty::Range(_)) && min >= max {
            self.error(
                "E-QTY-RANGE",
                format!("{path}.qty"),
                "a range needs min below max",
            );
        }
    }

    fn ingredient(&mut self, path: &str, ing: &Ingredient) {
        if let Some(a) = &ing.amount {
            self.amount(&format!("{path}.amount"), a);
        }
        if let Some(a) = &ing.alt {
            self.amount(&format!("{path}.alt"), a);
        }
        if ing.each.is_some_and(|e| !e.is_finite() || e <= 0.0) {
            self.error(
                "E-QTY-POSITIVE",
                format!("{path}.each"),
                "`each` must be a number above zero",
            );
        }
        if ing.item.as_deref().is_none_or(|i| i.trim().is_empty()) {
            self.error(
                "E-SCHEMA-ITEM",
                format!("{path}.item"),
                "an ingredient needs an item name",
            );
        }
    }

    fn identity(&mut self, file: &RecipeFile, ctx: &CheckContext) {
        let Some(stem) = file.path.strip_suffix(".json") else {
            self.error("E-SLUG-FILENAME", "", "recipe files must end in .json");
            return;
        };
        let slug = stem.rsplit('/').next().unwrap_or(stem);
        if slug == "_section" {
            self.error(
                "E-SLUG-FILENAME",
                "",
                "_section.json is reserved for sections",
            );
        } else if !is_slug(slug) {
            self.error(
                "E-SLUG-FORMAT",
                "",
                format!("'{slug}' is not a slug: use lowercase letters, digits and single hyphens"),
            );
        }
        let folder = file.folder();
        if !ctx.section_folders.contains(folder) {
            let shown = if folder.is_empty() {
                "the top level"
            } else {
                folder
            };
            self.error(
                "E-SECTION-MISSING",
                "",
                format!("{shown} has no _section.json"),
            );
        }
    }

    fn schema_level(&mut self) {
        let r = self.recipe;
        if r.title.trim().is_empty() {
            self.error("E-SCHEMA-BLANK", "title", "the title is empty");
        }
        if r.summary.trim().is_empty() {
            self.error("E-SCHEMA-BLANK", "summary", "the summary is empty");
        }
        if r.servings < 1 {
            self.error(
                "E-SCHEMA-SERVINGS",
                "servings",
                "servings must be at least 1",
            );
        }
        if r.ingredient_groups.is_empty() || r.ingredient_groups.iter().all(|g| g.items.is_empty())
        {
            self.error(
                "E-SCHEMA-INGREDIENTS",
                "ingredientGroups",
                "at least one ingredient is required",
            );
        }
        if r.steps.is_empty() {
            self.error("E-SCHEMA-STEPS", "steps", "at least one step is required");
        }
        for (i, step) in r.steps.iter().enumerate() {
            if step.text.trim().is_empty() {
                self.error(
                    "E-SCHEMA-BLANK",
                    format!("steps[{i}].text"),
                    "the step is empty",
                );
            }
        }
        if let Some(s) = &r.scaling {
            let bad = |v: Option<f64>| v.is_some_and(|v| !v.is_finite() || v <= 0.0);
            if bad(s.min) || bad(s.max) || matches!((s.min, s.max), (Some(a), Some(b)) if a > b) {
                self.error(
                    "E-SCALING-RANGE",
                    "scaling",
                    "scaling needs positive numbers with min not above max",
                );
            }
        }
        if let Some(pan) = &r.pan {
            let len_ok = match pan.shape {
                crate::schema::PanShape::Round => pan.size.len() == 1,
                crate::schema::PanShape::Square => matches!(pan.size.len(), 1 | 2),
                crate::schema::PanShape::Rect => pan.size.len() == 2,
            };
            let bad_number = |v: &f64| !v.is_finite() || *v <= 0.0;
            if !len_ok
                || pan.size.iter().any(bad_number)
                || pan.depth.as_ref().is_some_and(bad_number)
            {
                self.error("E-PAN-SIZE", "pan", "pan sizes are positive centimetres: one for round, two for rect, one or two for square");
            }
        }
        for (g, group) in r.ingredient_groups.iter().enumerate() {
            if let Some(total) = &group.total {
                self.amount(&format!("ingredientGroups[{g}].total"), total);
            }
            for (i, ing) in group.items.iter().enumerate() {
                self.ingredient(&format!("ingredientGroups[{g}].items[{i}]"), ing);
            }
        }
        if let Some(image) = &r.image
            && image.alt.trim().is_empty()
        {
            self.error("E-IMAGE-ALT", "image.alt", "the image needs alt text");
        }
    }

    fn keys_and_tokens(&mut self) -> BTreeSet<String> {
        let r = self.recipe;
        let mut keys = BTreeSet::new();
        for (g, group) in r.ingredient_groups.iter().enumerate() {
            for (i, ing) in group.items.iter().enumerate() {
                let Some(key) = &ing.key else { continue };
                let path = format!("ingredientGroups[{g}].items[{i}].key");
                if !is_key(key) {
                    self.error(
                        "E-KEY-FORMAT",
                        &path,
                        format!("'{key}' may only use letters, digits, - _ ."),
                    );
                }
                if !keys.insert(key.clone()) {
                    self.error(
                        "E-KEY-DUPLICATE",
                        path,
                        format!("ingredient key '{key}' is used twice"),
                    );
                }
            }
        }
        let mut step_keys = BTreeSet::new();
        for (i, step) in r.steps.iter().enumerate() {
            if let Some(key) = &step.key
                && !step_keys.insert(key.clone())
            {
                self.error(
                    "E-KEY-DUPLICATE",
                    format!("steps[{i}].key"),
                    format!("step key '{key}' is used twice"),
                );
            }
        }

        let mut referenced = BTreeSet::new();
        let mut texts: Vec<(String, &str)> = r
            .steps
            .iter()
            .enumerate()
            .map(|(i, s)| (format!("steps[{i}].text"), s.text.as_str()))
            .collect();
        for (v, variant) in r.variants.iter().enumerate() {
            for (o, option) in variant.options.iter().enumerate() {
                for (key, text) in &option.steps {
                    texts.push((format!("variants[{v}].options[{o}].steps.{key}"), text));
                }
            }
        }
        for (path, text) in texts {
            for segment in parse_tokens(text) {
                match segment {
                    Segment::Invalid { raw, reason } => {
                        self.error("E-TOKEN-SYNTAX", &path, format!("{raw}: {reason}"));
                    }
                    Segment::Ingredient { key, .. } => {
                        if !keys.contains(&key) {
                            self.error(
                                "E-TOKEN-UNRESOLVED",
                                &path,
                                format!("{{@{key}}} matches no ingredient key"),
                            );
                        }
                        referenced.insert(key);
                    }
                    _ => {}
                }
            }
        }
        for (g, group) in r.ingredient_groups.iter().enumerate() {
            for (i, ing) in group.items.iter().enumerate() {
                if let Some(key) = &ing.key
                    && !referenced.contains(key)
                {
                    self.warn(
                        "W-KEY-UNUSED",
                        format!("ingredientGroups[{g}].items[{i}].key"),
                        format!("key '{key}' is never referenced in the method"),
                    );
                }
            }
        }
        keys
    }

    fn variants(&mut self, ingredient_keys: &BTreeSet<String>) {
        let r = self.recipe;
        let step_keys: BTreeSet<&str> = r.steps.iter().filter_map(|s| s.key.as_deref()).collect();
        let mut variant_keys = BTreeSet::new();
        for (v, variant) in r.variants.iter().enumerate() {
            if !variant_keys.insert(variant.key.as_str()) {
                self.error(
                    "E-VARIANT-DUPLICATE",
                    format!("variants[{v}].key"),
                    format!("variant key '{}' is used twice", variant.key),
                );
            }
            if variant.options.is_empty() {
                self.error(
                    "E-VARIANT-EMPTY",
                    format!("variants[{v}].options"),
                    "a variant needs at least one option",
                );
            }
            if variant
                .options
                .iter()
                .filter(|o| o.default == Some(true))
                .count()
                > 1
            {
                self.error(
                    "E-VARIANT-DEFAULT",
                    format!("variants[{v}].options"),
                    "only one option can be the default",
                );
            }
            let mut option_keys = BTreeSet::new();
            for (o, option) in variant.options.iter().enumerate() {
                let base = format!("variants[{v}].options[{o}]");
                if !option_keys.insert(option.key.as_str()) {
                    self.error(
                        "E-VARIANT-DUPLICATE",
                        format!("{base}.key"),
                        format!("option key '{}' is used twice", option.key),
                    );
                }
                for (key, ing) in &option.ingredients {
                    let path = format!("{base}.ingredients.{key}");
                    if !ingredient_keys.contains(key) {
                        self.error(
                            "E-VARIANT-UNRESOLVED",
                            &path,
                            format!("no ingredient has the key '{key}'"),
                        );
                    }
                    self.ingredient(&path, ing);
                }
                for key in option.steps.keys() {
                    if !step_keys.contains(key.as_str()) {
                        self.error(
                            "E-VARIANT-UNRESOLVED",
                            format!("{base}.steps.{key}"),
                            format!("no step has the key '{key}'"),
                        );
                    }
                }
            }
        }
    }

    fn links_and_images(&mut self, file: &RecipeFile, ctx: &CheckContext) {
        let id = file.id();
        for (i, related) in self.recipe.related.clone().iter().enumerate() {
            if *related == id {
                self.error(
                    "E-RELATED-SELF",
                    format!("related[{i}]"),
                    "a recipe cannot relate to itself",
                );
            } else if !ctx.known_ids.contains(related) {
                self.error(
                    "E-RELATED-UNRESOLVED",
                    format!("related[{i}]"),
                    format!("no recipe has the id '{related}'"),
                );
            }
        }
        let Some(image) = &self.recipe.image else {
            return;
        };
        let resolved = resolve_relative(file.folder(), &image.src);
        let extension = resolved.rsplit_once('.').map(|(_, e)| e.to_lowercase());
        if !extension.is_some_and(|e| IMAGE_FORMATS.contains(&e.as_str())) {
            self.error(
                "E-IMAGE-FORMAT",
                "image.src",
                format!("{resolved} must be a JPEG, PNG or WebP file"),
            );
        }
        if let Some(files) = &ctx.files
            && !files.contains(&resolved)
        {
            self.error(
                "E-IMAGE-MISSING",
                "image.src",
                format!("{resolved} does not exist"),
            );
        } else if let Some(&width) = ctx.image_widths.get(&resolved)
            && width < MIN_IMAGE_WIDTH
        {
            self.warn(
                "W-IMAGE-SMALL",
                "image.src",
                format!("{resolved} is {width} px wide; {MIN_IMAGE_WIDTH} px or more stays sharp on large screens"),
            );
        }
    }

    fn scaling_sanity(&mut self) {
        let r = self.recipe;
        let mut selections = vec![BTreeMap::new()];
        for variant in &r.variants {
            for option in &variant.options {
                selections.push(BTreeMap::from([(variant.key.clone(), option.key.clone())]));
            }
        }
        let requests = [
            (ScaleRequest::Multiplier(0.5), "0.5x"),
            (ScaleRequest::Multiplier(1.0), "1x"),
            (ScaleRequest::Multiplier(2.0), "2x"),
            (ScaleRequest::Servings(50.0), "50 servings"),
        ];
        let mut seen = BTreeSet::new();
        for variants in selections {
            for (request, label) in &requests {
                let scaled = scale(
                    r,
                    request,
                    &ScaleOptions {
                        variants: variants.clone(),
                        ..ScaleOptions::default()
                    },
                );
                for (g, group) in scaled.groups.iter().enumerate() {
                    let totals = group
                        .total
                        .iter()
                        .map(|t| (format!("ingredientGroups[{g}].total"), t, None, None, false));
                    let items = group.items.iter().enumerate().filter_map(|(i, item)| {
                        let shown = item.amount.as_ref()?;
                        let each = r.precise
                            && r.ingredient_groups[g]
                                .items
                                .get(i)
                                .is_some_and(|b| b.each.is_some());
                        Some((
                            format!("ingredientGroups[{g}].items[{i}]"),
                            shown,
                            Some(item.mode),
                            item.food.as_deref(),
                            each,
                        ))
                    });
                    for (path, shown, mode, food, fractional_ok) in totals.chain(items) {
                        let problem = if !shown.min.is_finite() || !shown.max.is_finite() {
                            Some(("E-SCALE-NAN", "is not a finite number"))
                        } else if shown.min < 0.0 {
                            Some(("E-SCALE-NONPOSITIVE", "is negative"))
                        } else if shown.max <= 0.0 {
                            Some(("E-SCALE-ZERO", "rounds to zero"))
                        } else if mode == Some(crate::schema::ScaleMode::Discrete)
                            && !fractional_ok
                            && (shown.min.fract() != 0.0 || shown.max.fract() != 0.0)
                        {
                            Some((
                                "E-SCALE-FRACTIONAL",
                                "is fractional for a whole-piece ingredient",
                            ))
                        } else if shown.unit == Some(Unit::Pinch)
                            && food.is_some_and(|f| LEAVENERS.contains(&f))
                        {
                            Some(("E-SCALE-PINCH", "turns a measured leavener into a pinch"))
                        } else {
                            None
                        };
                        if let Some((id, what)) = problem
                            && seen.insert((id, path.clone()))
                        {
                            self.error(
                                id,
                                path,
                                format!("at {label} the amount \"{}\" {what}", shown.text),
                            );
                        }
                    }
                }
            }
        }
    }

    fn unit_toggles(&mut self) {
        let r = self.recipe;
        let mut amounts: Vec<(String, &Amount)> = Vec::new();
        for (g, group) in r.ingredient_groups.iter().enumerate() {
            if let Some(t) = &group.total {
                amounts.push((format!("ingredientGroups[{g}].total"), t));
            }
            for (i, ing) in group.items.iter().enumerate() {
                for (name, a) in [("amount", &ing.amount), ("alt", &ing.alt)] {
                    if let Some(a) = a {
                        amounts.push((format!("ingredientGroups[{g}].items[{i}].{name}"), a));
                    }
                }
            }
        }
        for (path, amount) in amounts {
            let Some(unit) = amount.unit else { continue };
            let start = amount.qty.max();
            if !start.is_finite() || start <= 0.0 || unit == Unit::Pinch {
                continue;
            }
            let returned = [UnitSystem::Metric, UnitSystem::Us]
                .into_iter()
                .flat_map(|system| unit_options(start, unit, system))
                .all(|(qty, to)| {
                    convert(qty, to, unit, None)
                        .is_some_and(|back| (back - start).abs() <= start * 1e-6)
                });
            if !returned {
                self.error(
                    "E-UNIT-TOGGLE",
                    path,
                    "a unit choice does not convert back to the written amount",
                );
            }
        }
    }

    fn warnings(&mut self) {
        let r = self.recipe;
        if r.times.is_none_or(|t| t.prep.is_none() && t.cook.is_none()) {
            self.warn("W-TIME-MISSING", "times", "no prep or cook time given");
        }
        if r.title.chars().count() > 60 {
            self.warn(
                "W-TITLE-LONG",
                "title",
                "the title is over 60 characters and may not fit a share card",
            );
        }
        if r.summary.chars().count() > 200 {
            self.warn(
                "W-SUMMARY-LONG",
                "summary",
                "the summary is over 200 characters and may not fit a share card",
            );
        }
        self.redundant_alts();
        self.seasoning_to_taste();
        self.british_spelling();
    }

    /// Salt and pepper with no amount read as "to taste" in the amount slot, which needs the mode set
    /// and the words kept out of the item.
    fn seasoning_to_taste(&mut self) {
        let r = self.recipe;
        for (g, group) in r.ingredient_groups.iter().enumerate() {
            for (i, ing) in group.items.iter().enumerate() {
                let item = ing.item.as_deref().unwrap_or_default().to_lowercase();
                let path = format!("ingredientGroups[{g}].items[{i}]");
                if item.contains("to taste") {
                    self.warn(
                        "W-TO-TASTE",
                        format!("{path}.item"),
                        "write \"to taste\" as the toTaste scale mode, not in the item",
                    );
                } else if ing.amount.is_none()
                    && ing.scale != Some(crate::schema::ScaleMode::ToTaste)
                    && is_seasoning(&item)
                {
                    self.warn(
                        "W-TO-TASTE",
                        format!("{path}.scale"),
                        "a seasoning with no amount should use the toTaste scale mode",
                    );
                }
            }
        }
    }

    /// An `alt` that restates the amount in an equivalent unit (1000 g and 1 kg) adds nothing.
    fn redundant_alts(&mut self) {
        let r = self.recipe;
        for (g, group) in r.ingredient_groups.iter().enumerate() {
            for (i, ing) in group.items.iter().enumerate() {
                let (Some(amount), Some(alt)) = (&ing.amount, &ing.alt) else {
                    continue;
                };
                let (Some(from), Some(to)) = (amount.unit, alt.unit) else {
                    continue;
                };
                // Only a restatement in the same metric family is redundant; 60 ml (4 tbsp) is useful.
                let family = from == to
                    || matches!((from, to), (Unit::G, Unit::Kg) | (Unit::Kg, Unit::G))
                    || matches!((from, to), (Unit::Ml, Unit::L) | (Unit::L, Unit::Ml));
                if !family {
                    continue;
                }
                let same = |a: f64, b: f64| {
                    convert(a, from, to, None).is_some_and(|c| (c - b).abs() <= b.abs() * 1e-6)
                };
                if same(amount.qty.min(), alt.qty.min()) && same(amount.qty.max(), alt.qty.max()) {
                    self.warn(
                        "W-ALT-REDUNDANT",
                        format!("ingredientGroups[{g}].items[{i}].alt"),
                        "the alt is the same amount as the main one in another unit, so it can go",
                    );
                }
            }
        }
    }

    fn british_spelling(&mut self) {
        let r = self.recipe;
        let mut fields: Vec<(String, String)> = vec![
            ("title".into(), r.title.clone()),
            ("summary".into(), r.summary.clone()),
        ];
        let mut add = |path: String, text: &str| fields.push((path, text.to_owned()));
        if let Some(origin) = &r.origin {
            add("origin".into(), origin);
        }
        if let Some(note) = r.scaling.as_ref().and_then(|s| s.note.as_ref()) {
            add("scaling.note".into(), note);
        }
        if let Some(image) = &r.image {
            add("image.alt".into(), &image.alt);
        }
        for (i, text) in r.tags.iter().enumerate() {
            add(format!("tags[{i}]"), text);
        }
        for (i, text) in r.equipment.iter().enumerate() {
            add(format!("equipment[{i}]"), text);
        }
        for (i, text) in r.tips.iter().enumerate() {
            add(format!("tips[{i}]"), text);
        }
        let mut ingredient_fields = |path: String, ing: &Ingredient| {
            for (name, value) in [
                ("prefix", &ing.prefix),
                ("item", &ing.item),
                ("note", &ing.note),
            ] {
                if let Some(value) = value {
                    add(format!("{path}.{name}"), value);
                }
            }
        };
        for (g, group) in r.ingredient_groups.iter().enumerate() {
            if let Some(name) = &group.name {
                ingredient_fields(
                    format!("ingredientGroups[{g}]"),
                    &Ingredient {
                        item: Some(name.clone()),
                        ..Ingredient::default()
                    },
                );
            }
            for (i, ing) in group.items.iter().enumerate() {
                ingredient_fields(format!("ingredientGroups[{g}].items[{i}]"), ing);
            }
        }
        let mut step_texts: Vec<(String, &str)> = r
            .steps
            .iter()
            .enumerate()
            .map(|(i, s)| (format!("steps[{i}].text"), s.text.as_str()))
            .collect();
        for (v, variant) in r.variants.iter().enumerate() {
            fields.push((format!("variants[{v}].label"), variant.label.clone()));
            for (o, option) in variant.options.iter().enumerate() {
                let base = format!("variants[{v}].options[{o}]");
                fields.push((format!("{base}.label"), option.label.clone()));
                for (key, text) in &option.steps {
                    step_texts.push((format!("{base}.steps.{key}"), text));
                }
                for (key, ing) in &option.ingredients {
                    for (name, value) in [
                        ("prefix", &ing.prefix),
                        ("item", &ing.item),
                        ("note", &ing.note),
                    ] {
                        if let Some(value) = value {
                            fields
                                .push((format!("{base}.ingredients.{key}.{name}"), value.clone()));
                        }
                    }
                }
                for (t, tip) in option.tips.iter().flatten().enumerate() {
                    fields.push((format!("{base}.tips[{t}]"), tip.clone()));
                }
            }
        }
        for (path, text) in step_texts {
            let prose: String = parse_tokens(text)
                .into_iter()
                .filter_map(|s| match s {
                    Segment::Text { text } => Some(text),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" ");
            fields.push((path, prose));
        }
        for (path, text) in fields {
            let mut reported = BTreeSet::new();
            for word in text.split(|c: char| !c.is_alphabetic()) {
                let lower = word.to_lowercase();
                if let Some((_, british)) = AMERICAN.iter().find(|(us, _)| *us == lower)
                    && reported.insert(lower.clone())
                {
                    self.warn(
                        "W-BRITISH-SPELLING",
                        &path,
                        format!("'{lower}' should be '{british}'"),
                    );
                }
            }
        }
    }
}

/// Runs every per-recipe check.
pub fn check_recipe(file: &RecipeFile, ctx: &CheckContext) -> Vec<CheckResult> {
    let mut checker = Checker {
        recipe: &file.recipe,
        subject: file.id(),
        out: Vec::new(),
    };
    checker.identity(file, ctx);
    checker.schema_level();
    let keys = checker.keys_and_tokens();
    checker.variants(&keys);
    checker.links_and_images(file, ctx);
    let amounts_ok = !checker
        .out
        .iter()
        .any(|r| r.id.starts_with("E-QTY") || r.id == "E-SCHEMA-SERVINGS");
    if amounts_ok {
        checker.scaling_sanity();
    }
    checker.unit_toggles();
    checker.warnings();
    checker.out
}

fn ancestors(folder: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for part in folder.split('/').filter(|p| !p.is_empty()) {
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(part);
        out.push(current.clone());
    }
    out
}

/// Checks every recipe, then the collection as a whole: duplicate ids, sections and empty sections.
pub fn check_all(collection: &Collection) -> Vec<CheckResult> {
    let ctx = collection.context();
    let mut out = Vec::new();
    let mut reported_folders = BTreeSet::new();
    for file in &collection.recipes {
        for result in check_recipe(file, &ctx) {
            if result.id == "E-SECTION-MISSING"
                && !reported_folders.insert(file.folder().to_owned())
            {
                continue;
            }
            out.push(result);
        }
    }

    let mut seen: BTreeMap<String, String> = BTreeMap::new();
    for file in &collection.recipes {
        let id = file.id();
        if let Some(first) = seen.insert(id.to_lowercase(), id.clone()) {
            out.push(CheckResult {
                id: "E-ID-DUPLICATE",
                level: Level::Error,
                message: format!("'{id}' clashes with '{first}' once case is ignored"),
                path: String::new(),
                recipe: id,
            });
        }
    }

    let mut folders: BTreeSet<String> = collection
        .folders
        .iter()
        .flat_map(|f| ancestors(f))
        .collect();
    folders.extend(
        collection
            .sections
            .iter()
            .flat_map(|s| ancestors(&s.folder)),
    );
    folders.extend(
        collection
            .recipes
            .iter()
            .flat_map(|r| ancestors(r.folder())),
    );
    let section_folders = &ctx.section_folders;
    let folder_error = |id: &'static str, folder: &str, message: String| CheckResult {
        id,
        level: Level::Error,
        message,
        path: String::new(),
        recipe: folder.to_owned(),
    };
    for folder in &folders {
        let name = folder.rsplit('/').next().unwrap_or(folder);
        if !is_slug(name) {
            out.push(folder_error(
                "E-SLUG-FORMAT",
                folder,
                format!("folder '{name}' is not a slug"),
            ));
        }
        if !section_folders.contains(folder) && reported_folders.insert(folder.clone()) {
            out.push(folder_error(
                "E-SECTION-MISSING",
                folder,
                format!("{folder} has no _section.json"),
            ));
        }
    }
    for section in &collection.sections {
        if section.section.title.trim().is_empty() {
            out.push(folder_error(
                "E-SCHEMA-BLANK",
                &section.folder,
                "the section title is empty".to_owned(),
            ));
        }
        let prefix = format!("{}/", section.folder);
        if !collection
            .recipes
            .iter()
            .any(|r| r.path.starts_with(&prefix))
        {
            out.push(CheckResult {
                id: "W-SECTION-EMPTY",
                level: Level::Warning,
                message: format!("section '{}' has no recipes", section.folder),
                path: String::new(),
                recipe: section.folder.clone(),
            });
        }
    }
    out
}

/// Lists the recipes that still link to `id`, which block its removal.
pub fn check_removal(id: &str, collection: &Collection) -> Vec<CheckResult> {
    collection
        .recipes
        .iter()
        .flat_map(|file| {
            file.recipe
                .related
                .iter()
                .enumerate()
                .filter(|(_, related)| related.as_str() == id)
                .map(|(i, _)| CheckResult {
                    id: "E-REMOVE-LINKED",
                    level: Level::Error,
                    message: format!("'{}' still links to '{id}'", file.id()),
                    path: format!("related[{i}]"),
                    recipe: file.id(),
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

/// Salt, pepper or both, as an item with nothing else in it.
fn is_seasoning(item: &str) -> bool {
    let words = item
        .trim()
        .trim_start_matches("kosher ")
        .trim_start_matches("sea ")
        .trim_start_matches("flaky ");
    matches!(
        words,
        "salt" | "pepper" | "black pepper" | "salt and pepper" | "salt and black pepper"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::parse_recipe;

    const BASE: &str = r#"{
        "title": "Soup", "summary": "A soup.", "servings": 4, "times": { "prep": 5, "cook": 20 },
        "ingredientGroups": [{ "items": [
            { "key": "stock", "amount": { "qty": 1, "unit": "l" }, "item": "vegetable stock" },
            { "key": "salt", "amount": { "qty": 1, "unit": "tsp" }, "item": "salt", "scale": "seasoning" },
            { "key": "egg", "amount": { "qty": 2 }, "item": "eggs", "scale": "discrete" }
        ]}],
        "steps": [{ "key": "cook", "text": "Heat {@stock} to {temp:90}, add {@salt} and {@egg}, simmer {timer:10}." }],
        "related": ["mains/other"]
    }"#;

    fn ctx() -> CheckContext {
        CheckContext {
            known_ids: ["mains/soup", "mains/other"].map(String::from).into(),
            section_folders: ["mains"].map(String::from).into(),
            files: Some(BTreeSet::new()),
            image_widths: BTreeMap::new(),
        }
    }

    fn run(path: &str, json: &str) -> Vec<CheckResult> {
        check_recipe(
            &RecipeFile {
                path: path.into(),
                recipe: parse_recipe(json).unwrap(),
            },
            &ctx(),
        )
    }

    fn codes(results: &[CheckResult]) -> Vec<&'static str> {
        results.iter().map(|r| r.id).collect()
    }

    #[test]
    fn a_valid_recipe_is_clean() {
        assert_eq!(run("mains/soup.json", BASE), vec![]);
    }

    #[test]
    fn each_mutation_raises_its_check() {
        let cases: [(&str, &str, &str, &str); 25] = [
            (
                "zero quantity",
                r#""qty": 1, "unit": "l""#,
                r#""qty": 0, "unit": "l""#,
                "E-QTY-POSITIVE",
            ),
            (
                "inverted range",
                r#""amount": { "qty": 2 }"#,
                r#""amount": { "qty": { "min": 3, "max": 2 } }"#,
                "E-QTY-RANGE",
            ),
            (
                "duplicate key",
                r#""key": "salt""#,
                r#""key": "stock""#,
                "E-KEY-DUPLICATE",
            ),
            (
                "bad key",
                r#""key": "salt""#,
                r#""key": "sa lt""#,
                "E-KEY-FORMAT",
            ),
            (
                "unresolved token",
                "{@egg}",
                "{@eggs}",
                "E-TOKEN-UNRESOLVED",
            ),
            ("broken token", "{timer:10}", "{timer:x}", "E-TOKEN-SYNTAX"),
            (
                "dangling link",
                "mains/other",
                "mains/ghost",
                "E-RELATED-UNRESOLVED",
            ),
            ("self link", "mains/other", "mains/soup", "E-RELATED-SELF"),
            (
                "no servings",
                r#""servings": 4"#,
                r#""servings": 0"#,
                "E-SCHEMA-SERVINGS",
            ),
            (
                "blank summary",
                r#""summary": "A soup.""#,
                r#""summary": " ""#,
                "E-SCHEMA-BLANK",
            ),
            (
                "no item",
                r#""item": "salt""#,
                r#""item": """#,
                "E-SCHEMA-ITEM",
            ),
            (
                "bad scaling",
                r#""servings": 4,"#,
                r#""servings": 4, "scaling": { "min": 9, "max": 2 },"#,
                "E-SCALING-RANGE",
            ),
            (
                "bad pan",
                r#""servings": 4,"#,
                r#""servings": 4, "pan": { "shape": "round", "size": [20, 20] },"#,
                "E-PAN-SIZE",
            ),
            (
                "image without alt",
                r#""servings": 4,"#,
                r#""servings": 4, "image": { "src": "a.jpg", "alt": "" },"#,
                "E-IMAGE-ALT",
            ),
            (
                "missing image",
                r#""servings": 4,"#,
                r#""servings": 4, "image": { "src": "a.jpg", "alt": "Soup" },"#,
                "E-IMAGE-MISSING",
            ),
            ("unused key", " add {@salt} and", " add", "W-KEY-UNUSED"),
            (
                "no times",
                r#""times": { "prep": 5, "cook": 20 },"#,
                "",
                "W-TIME-MISSING",
            ),
            (
                "long title",
                r#""title": "Soup""#,
                r#""title": "A very long title that goes on and on well past the sixty character limit""#,
                "W-TITLE-LONG",
            ),
            (
                "long summary",
                r#""summary": "A soup.""#,
                &format!("\"summary\": \"{}\"", "x".repeat(201)),
                "W-SUMMARY-LONG",
            ),
            (
                "american spelling",
                r#""summary": "A soup.""#,
                r#""summary": "A colorful soup.""#,
                "W-BRITISH-SPELLING",
            ),
            (
                "rounds to zero",
                r#"{ "key": "egg", "amount": { "qty": 2 }, "item": "eggs", "scale": "discrete" }"#,
                r#"{ "key": "egg", "amount": { "qty": 0.2 }, "item": "eggs" }"#,
                "E-SCALE-ZERO",
            ),
            (
                "leavener pinch",
                r#"{ "key": "egg", "amount": { "qty": 2 }, "item": "eggs", "scale": "discrete" }"#,
                r#"{ "key": "egg", "food": "baking-powder", "amount": { "qty": 0.2, "unit": "tsp" }, "item": "baking powder" }"#,
                "E-SCALE-PINCH",
            ),
            (
                "variant override",
                r#""related""#,
                r#""variants": [{ "key": "v", "label": "V", "options": [{ "key": "o", "label": "O", "ingredients": { "nope": { "item": "x" } }, "steps": { "nope": "y" } }] }], "related""#,
                "E-VARIANT-UNRESOLVED",
            ),
            (
                "unsupported image format",
                r#""servings": 4,"#,
                r#""servings": 4, "image": { "src": "a.gif", "alt": "Soup" },"#,
                "E-IMAGE-FORMAT",
            ),
            (
                "empty steps",
                r#""steps": [{ "key": "cook", "text": "Heat {@stock} to {temp:90}, add {@salt} and {@egg}, simmer {timer:10}." }]"#,
                r#""steps": []"#,
                "E-SCHEMA-STEPS",
            ),
        ];
        for (name, from, to, expected) in cases {
            assert!(
                BASE.contains(from),
                "{name}: base lacks the text to replace"
            );
            let results = run("mains/soup.json", &BASE.replace(from, to));
            assert!(
                codes(&results).contains(&expected),
                "{name}: wanted {expected}, got {:?}",
                codes(&results)
            );
        }
    }

    #[test]
    fn narrow_photos_get_a_warning() {
        let with_image = BASE.replace(
            r#""servings": 4,"#,
            r#""servings": 4, "image": { "src": "a.jpg", "alt": "Soup" },"#,
        );
        let check = |width: u32| {
            let context = CheckContext {
                files: Some(BTreeSet::from(["mains/a.jpg".to_owned()])),
                image_widths: BTreeMap::from([("mains/a.jpg".to_owned(), width)]),
                ..ctx()
            };
            check_recipe(
                &RecipeFile {
                    path: "mains/soup.json".into(),
                    recipe: parse_recipe(&with_image).unwrap(),
                },
                &context,
            )
        };
        assert_eq!(codes(&check(800)), ["W-IMAGE-SMALL"]);
        assert_eq!(codes(&check(1200)), Vec::<&str>::new());
    }

    #[test]
    fn a_redundant_alt_is_flagged_but_a_real_equivalent_is_not() {
        let with_alt = |amount: &str, alt: &str| {
            BASE.replace(
                r#""key": "stock", "amount": { "qty": 1, "unit": "l" }"#,
                &format!(r#""key": "stock", "amount": {amount}, "alt": {alt}"#),
            )
        };
        let redundant = with_alt(
            r#"{ "qty": 1000, "unit": "ml" }"#,
            r#"{ "qty": 1, "unit": "l" }"#,
        );
        assert!(codes(&run("mains/soup.json", &redundant)).contains(&"W-ALT-REDUNDANT"));
        let useful = with_alt(
            r#"{ "qty": 60, "unit": "ml" }"#,
            r#"{ "qty": 4, "unit": "tbsp" }"#,
        );
        assert!(!codes(&run("mains/soup.json", &useful)).contains(&"W-ALT-REDUNDANT"));
    }

    #[test]
    fn seasoning_without_an_amount_is_marked_to_taste() {
        let salt = r#"{ "key": "salt", "amount": { "qty": 1, "unit": "tsp" }, "item": "salt", "scale": "seasoning" }"#;
        let with = |line: &str| BASE.replace(salt, line).replace(" add {@salt} and", " add");
        let plain = with(r#"{ "item": "Salt and black pepper" }"#);
        assert!(codes(&run("mains/soup.json", &plain)).contains(&"W-TO-TASTE"));
        let worded = with(r#"{ "item": "Salt to taste", "scale": "toTaste" }"#);
        assert!(codes(&run("mains/soup.json", &worded)).contains(&"W-TO-TASTE"));
        let right = with(r#"{ "item": "Salt and black pepper", "scale": "toTaste" }"#);
        assert!(!codes(&run("mains/soup.json", &right)).contains(&"W-TO-TASTE"));
        let herb = with(r#"{ "item": "Fresh parsley" }"#);
        assert!(!codes(&run("mains/soup.json", &herb)).contains(&"W-TO-TASTE"));
    }

    #[test]
    fn levels_match_the_id_prefix() {
        let results = run(
            "mains/soup.json",
            &BASE
                .replace("{@egg}", "{@eggs}")
                .replace(r#""times": { "prep": 5, "cook": 20 },"#, ""),
        );
        for r in &results {
            assert_eq!(r.level == Level::Error, r.id.starts_with("E-"), "{}", r.id);
        }
        assert!(has_errors(&results));
        assert_eq!(
            results
                .iter()
                .find(|r| r.id == "E-TOKEN-UNRESOLVED")
                .unwrap()
                .path,
            "steps[0].text"
        );
    }

    #[test]
    fn path_checks() {
        for (path, expected) in [
            ("mains/Soup_Two.json", "E-SLUG-FORMAT"),
            ("mains/soup.txt", "E-SLUG-FILENAME"),
            ("mains/_section.json", "E-SLUG-FILENAME"),
            ("elsewhere/soup.json", "E-SECTION-MISSING"),
            ("soup.json", "E-SECTION-MISSING"),
        ] {
            assert!(codes(&run(path, BASE)).contains(&expected), "{path}");
        }
    }

    #[test]
    fn variant_selections_are_scaled_too() {
        let json = BASE.replace(
            r#""related""#,
            r#""variants": [{ "key": "v", "label": "V", "options": [
                { "key": "a", "label": "A", "default": true },
                { "key": "b", "label": "B", "ingredients": { "egg": { "amount": { "qty": 0.2 }, "item": "eggs" } } }] }], "related""#,
        );
        assert!(codes(&run("mains/soup.json", &json)).contains(&"E-SCALE-ZERO"));
    }

    fn collection(extra: &[(&str, &str)]) -> Collection {
        let mut c = Collection::default();
        c.sections.push(SectionFile {
            folder: "mains".into(),
            section: Section {
                title: "Mains".into(),
                order: None,
                summary: None,
            },
        });
        c.sections.push(SectionFile {
            folder: "empty".into(),
            section: Section {
                title: "Empty".into(),
                order: None,
                summary: None,
            },
        });
        c.folders = vec!["mains".into(), "empty".into()];
        for (path, json) in [
            ("mains/soup.json", BASE),
            (
                "mains/other.json",
                &BASE.replace("mains/other", "mains/soup"),
            ),
        ]
        .into_iter()
        .chain(extra.iter().copied())
        {
            c.recipes.push(RecipeFile {
                path: path.into(),
                recipe: parse_recipe(json).unwrap(),
            });
        }
        c
    }

    #[test]
    fn collection_checks() {
        let results = check_all(&collection(&[
            ("mains/SOUP.json", BASE),
            ("loose/a.json", BASE),
            ("loose/b.json", BASE),
        ]));
        let all = codes(&results);
        assert!(all.contains(&"E-ID-DUPLICATE"));
        assert!(all.contains(&"W-SECTION-EMPTY"));
        assert_eq!(
            all.iter().filter(|c| **c == "E-SECTION-MISSING").count(),
            1,
            "one report per folder"
        );
        assert!(
            results
                .iter()
                .any(|r| r.id == "W-SECTION-EMPTY" && r.recipe == "empty")
        );
    }

    #[test]
    fn removal_lists_linking_recipes() {
        let c = collection(&[]);
        let blockers = check_removal("mains/other", &c);
        assert_eq!(blockers.len(), 1);
        assert_eq!(blockers[0].recipe, "mains/soup");
        assert_eq!(blockers[0].id, "E-REMOVE-LINKED");
        assert!(
            check_removal("mains/soup", &c)
                .iter()
                .all(|r| r.recipe == "mains/other")
        );
        assert!(check_removal("nothing", &c).is_empty());
    }

    #[test]
    fn relative_image_paths_resolve() {
        assert_eq!(resolve_relative("a/b", "../img/x.jpg"), "a/img/x.jpg");
        assert_eq!(resolve_relative("", "./x.jpg"), "x.jpg");
        assert!(is_slug("one-pot-pasta") && !is_slug("One") && !is_slug("a--b") && !is_slug("-a"));
    }
}
