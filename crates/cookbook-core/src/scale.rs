use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    format::{DisplayCtx, Shown, display_amount},
    schema::{Amount, Ingredient, Pan, Recipe, ScaleMode, StepTime, Unit},
    tokens::{RenderedSegment, Segment, parse_tokens, render_segments, render_text},
    units::{UnitSystem, convert},
};

pub type ScaledAmount = Shown;

const EPSILON: f64 = 1e-9;

#[derive(Debug, Clone, PartialEq, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ScaleRequest {
    Servings(f64),
    Multiplier(f64),
    /// "I have this much of that ingredient"; the unit defaults to the ingredient's own.
    Have {
        key: String,
        qty: f64,
        unit: Option<Unit>,
    },
    /// The pan the cook owns; the factor is the area ratio to the recipe's pan.
    Pan(Pan),
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase")]
pub struct ScaleOptions {
    pub system: UnitSystem,
    /// Chosen option per variant key; a variant left out uses its default option.
    pub variants: BTreeMap<String, String>,
}

impl Default for ScaleOptions {
    fn default() -> Self {
        Self {
            system: UnitSystem::Metric,
            variants: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
pub struct Warning {
    pub code: &'static str,
    pub message: String,
    pub key: Option<String>,
}

fn warning(code: &'static str, message: impl Into<String>, key: Option<&str>) -> Warning {
    Warning {
        code,
        message: message.into(),
        key: key.map(str::to_owned),
    }
}

#[derive(Debug, Clone)]
pub(crate) struct Exact {
    lo: f64,
    hi: f64,
    unit: Option<Unit>,
    system: Option<UnitSystem>,
    precise: bool,
    food: Option<String>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScaledIngredient {
    pub key: Option<String>,
    pub food: Option<String>,
    pub prefix: Option<String>,
    pub item: String,
    pub note: Option<String>,
    pub optional: bool,
    pub mode: ScaleMode,
    pub amount: Option<ScaledAmount>,
    /// The author's equivalent, or grams for a fractional egg.
    pub alt: Option<ScaledAmount>,
    pub to_taste: bool,
    /// True when the amount differs from the written one, so the UI can tint it.
    pub scaled: bool,
    pub hint: Option<String>,
    /// The whole line, e.g. "130 ml (9 tbsp) olive oil, warm".
    pub text: String,
    #[serde(skip)]
    pub(crate) exact: Option<Exact>,
}

fn join_words(parts: &[Option<&str>]) -> String {
    parts
        .iter()
        .flatten()
        .filter(|p| !p.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" ")
}

impl ScaledIngredient {
    fn is_pinch(&self) -> bool {
        self.amount.as_ref().and_then(|a| a.unit) == Some(Unit::Pinch)
    }

    /// The text a `{@key}` token renders to, optionally for a share of the amount.
    pub fn inline_text(&self, amount_only: bool, fraction: Option<f64>) -> String {
        let amount = match (&self.exact, fraction) {
            (Some(e), Some(f)) => Some(e.display(f).text),
            _ => self.amount.as_ref().map(|a| a.text.clone()),
        };
        match amount {
            Some(text) if amount_only => text,
            Some(text) => {
                let of = (self.is_pinch() && !self.item.is_empty()).then_some("of");
                join_words(&[self.prefix.as_deref(), Some(&text), of, Some(&self.item)])
            }
            None if amount_only && self.to_taste => "to taste".to_owned(),
            None => join_words(&[self.prefix.as_deref(), Some(&self.item)]),
        }
    }

    fn line(&self) -> String {
        let alt = self.alt.as_ref().map(|a| format!("({})", a.text));
        let of = (self.is_pinch() && !self.item.is_empty()).then_some("of");
        let mut line = join_words(&[
            self.prefix.as_deref(),
            self.amount.as_ref().map(|a| a.text.as_str()),
            alt.as_deref(),
            of,
            Some(&self.item),
        ]);
        let taste = (self.to_taste && !self.note.as_deref().is_some_and(|n| n.contains("taste")))
            .then_some("to taste");
        for extra in [self.note.as_deref(), taste].into_iter().flatten() {
            line.push_str(", ");
            line.push_str(extra);
        }
        if self.optional {
            line.push_str(" (optional)");
        }
        line
    }
}

impl Exact {
    fn display(&self, share: f64) -> Shown {
        display_amount(
            self.lo * share,
            self.hi * share,
            self.unit,
            &DisplayCtx {
                system: self.system,
                precise: self.precise,
                food: self.food.as_deref(),
            },
        )
    }
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScaledGroup {
    pub name: Option<String>,
    pub total: Option<ScaledAmount>,
    pub items: Vec<ScaledIngredient>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScaledStep {
    pub heading: Option<String>,
    pub text: String,
    pub segments: Vec<RenderedSegment>,
    pub key: Option<String>,
    pub time: Option<StepTime>,
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScaledRecipe {
    pub factor: f64,
    pub servings: f64,
    pub groups: Vec<ScaledGroup>,
    pub steps: Vec<ScaledStep>,
    pub tips: Vec<String>,
    pub warnings: Vec<Warning>,
    pub hints: Vec<String>,
}

/// Replaces ingredients, steps and tips by key for the chosen option of each variant.
pub fn apply_variants(recipe: &Recipe, selection: &BTreeMap<String, String>) -> Recipe {
    let mut out = recipe.clone();
    for variant in &recipe.variants {
        let chosen = selection
            .get(&variant.key)
            .and_then(|k| variant.options.iter().find(|o| &o.key == k))
            .or_else(|| variant.options.iter().find(|o| o.default == Some(true)))
            .or_else(|| variant.options.first());
        let Some(option) = chosen else { continue };
        for item in out
            .ingredient_groups
            .iter_mut()
            .flat_map(|g| g.items.iter_mut())
        {
            if let Some(key) = &item.key
                && let Some(replacement) = option.ingredients.get(key)
            {
                let key = key.clone();
                *item = Ingredient {
                    key: Some(key),
                    ..replacement.clone()
                };
            }
        }
        for step in &mut out.steps {
            if let Some(key) = &step.key
                && let Some(text) = option.steps.get(key)
            {
                step.text.clone_from(text);
            }
        }
        if let Some(tips) = &option.tips {
            out.tips.clone_from(tips);
        }
    }
    out
}

/// The exact factor for a request, with warnings; an unusable request falls back to 1.
pub fn factor_for(recipe: &Recipe, request: &ScaleRequest) -> (f64, Vec<Warning>) {
    let mut warnings = Vec::new();
    let factor = match request {
        ScaleRequest::Servings(n) => n / f64::from(recipe.servings.max(1)),
        ScaleRequest::Multiplier(m) => *m,
        ScaleRequest::Have { key, qty, unit } => {
            have_factor(recipe, key, *qty, *unit, &mut warnings)
        }
        ScaleRequest::Pan(pan) => pan_factor(recipe, pan, &mut warnings),
    };
    if factor.is_finite() && factor > 0.0 {
        (factor, warnings)
    } else {
        warnings.push(warning(
            "scale-invalid",
            "That scale is not usable, so the recipe is shown as written.",
            None,
        ));
        (1.0, warnings)
    }
}

fn have_factor(
    recipe: &Recipe,
    key: &str,
    qty: f64,
    unit: Option<Unit>,
    warnings: &mut Vec<Warning>,
) -> f64 {
    let Some(amount) = recipe
        .find_ingredient(key)
        .and_then(|i| i.amount.as_ref().map(|a| (i, a)))
    else {
        warnings.push(warning(
            "have-unknown",
            format!("No ingredient '{key}' with an amount to scale by."),
            Some(key),
        ));
        return 1.0;
    };
    let (ingredient, amount) = amount;
    let have = match (unit, amount.unit) {
        (None, _) => Some(qty),
        (Some(have), Some(base)) => convert(qty, have, base, ingredient.food.as_deref()),
        (Some(_), None) => None,
    };
    match have {
        Some(have) if amount.qty.midpoint() > 0.0 => have / amount.qty.midpoint(),
        _ => {
            warnings.push(warning(
                "units-incompatible",
                format!("Cannot compare that amount with '{key}'."),
                Some(key),
            ));
            1.0
        }
    }
}

fn pan_factor(recipe: &Recipe, pan: &Pan, warnings: &mut Vec<Warning>) -> f64 {
    let (Some(original), Some(from), Some(to)) = (
        recipe.pan.as_ref(),
        recipe.pan.as_ref().and_then(Pan::area),
        pan.area(),
    ) else {
        warnings.push(warning(
            "pan-missing",
            "This recipe has no pan size to scale from.",
            None,
        ));
        return 1.0;
    };
    if let (Some(a), Some(b)) = (original.depth, pan.depth)
        && (a - b).abs() > 0.25
    {
        warnings.push(warning(
            "pan-depth",
            format!(
                "The pan is {b} cm deep instead of {a} cm: a deeper pan needs a longer, lower bake, and a shallower one the reverse."
            ),
            None,
        ));
    }
    to / from
}

fn round_discrete(x: f64, fractional: bool) -> (f64, bool) {
    if fractional {
        let part = x - x.floor();
        if (0.25..=0.75).contains(&part) {
            return (x.floor() + 0.5, true);
        }
    }
    (x.round().max(1.0), false)
}

fn seasoned_low(base: f64, factor: f64) -> f64 {
    base.max(0.75 * base * factor)
}

fn ratio(scaled: f64, base: f64) -> f64 {
    if base > 0.0 { scaled / base } else { 1.0 }
}

fn scale_ingredient(
    ing: &Ingredient,
    factor: f64,
    recipe: &Recipe,
    system: UnitSystem,
    warnings: &mut Vec<Warning>,
) -> ScaledIngredient {
    let mode = ing.mode();
    let mut out = ScaledIngredient {
        key: ing.key.clone(),
        food: ing.food.clone(),
        prefix: ing.prefix.clone(),
        item: ing.item.clone().unwrap_or_default(),
        note: ing.note.clone(),
        optional: ing.optional,
        mode,
        amount: None,
        alt: None,
        to_taste: mode == ScaleMode::ToTaste,
        scaled: false,
        hint: None,
        text: String::new(),
        exact: None,
    };
    if let (Some(a), false) = (&ing.amount, out.to_taste) {
        apply_amount(ing, a, factor, recipe, system, &mut out, warnings);
    }
    out.text = out.line();
    out
}

fn apply_amount(
    ing: &Ingredient,
    a: &Amount,
    factor: f64,
    recipe: &Recipe,
    system: UnitSystem,
    out: &mut ScaledIngredient,
    warnings: &mut Vec<Warning>,
) {
    let mode = ing.mode();
    let (base_lo, base_hi) = (a.qty.min(), a.qty.max());
    let fractional_ok = recipe.precise && ing.each.is_some();
    let mut fractional = false;
    let (lo, hi) = match mode {
        ScaleMode::Fixed => (base_lo, base_hi),
        ScaleMode::Seasoning if factor > 1.0 => {
            out.hint = Some("start low, then taste".to_owned());
            (seasoned_low(base_lo, factor), base_hi * factor)
        }
        ScaleMode::Discrete => {
            let (lo, lo_frac) = round_discrete(base_lo * factor, fractional_ok);
            let (hi, hi_frac) = round_discrete(base_hi * factor, fractional_ok);
            fractional = lo_frac || hi_frac;
            (lo, hi)
        }
        _ => (base_lo * factor, base_hi * factor),
    };
    if mode == ScaleMode::Discrete && (factor - 1.0).abs() > EPSILON {
        let exact = base_hi * factor;
        if exact > 0.0 && (hi - exact).abs() / exact > 0.15 {
            let item = if out.item.is_empty() {
                "this item"
            } else {
                &out.item
            };
            let mut message = format!(
                "{item} is kept to whole pieces, so it is about {}% off the exact ratio.",
                ((hi - exact).abs() / exact * 100.0).round()
            );
            if let Some(each) = ing.each {
                message.push_str(&format!(" Exactly, that is {} g.", (exact * each).round()));
            }
            warnings.push(warning("discrete-rounding", message, ing.key.as_deref()));
        }
    }

    let (r_lo, r_hi) = (ratio(lo, base_lo), ratio(hi, base_hi));
    out.scaled = (r_lo - 1.0).abs() > EPSILON || (r_hi - 1.0).abs() > EPSILON;
    let keep_authored_units = ing.alt.is_some();
    let ctx = DisplayCtx {
        system: (!keep_authored_units).then_some(system),
        precise: recipe.precise,
        food: ing.food.as_deref(),
    };
    let mut amount = display_amount(lo, hi, a.unit, &ctx);
    out.exact = Some(Exact {
        lo,
        hi,
        unit: a.unit,
        system: ctx.system,
        precise: ctx.precise,
        food: ing.food.clone(),
    });

    let mut alt = match &ing.alt {
        Some(alt) => Some(display_amount(
            alt.qty.min() * r_lo,
            alt.qty.max() * r_hi,
            alt.unit,
            &ctx,
        )),
        None if fractional => ing
            .each
            .map(|each| display_amount(lo * each, hi * each, Some(Unit::G), &ctx)),
        None => None,
    };
    let alt_is_native = ing
        .alt
        .as_ref()
        .is_some_and(|alt| alt.unit.and_then(Unit::system) == Some(UnitSystem::Us));
    if system == UnitSystem::Us
        && alt_is_native
        && a.unit.and_then(Unit::system) == Some(UnitSystem::Metric)
        && let Some(alt) = alt.as_mut()
    {
        std::mem::swap(&mut amount, alt);
    }
    // An equivalent that reads the same as the main amount (1000 g and 1 kg) is not worth showing.
    out.alt = alt.filter(|alt| alt.text != amount.text);
    out.amount = Some(amount);
}

pub fn scale(recipe: &Recipe, request: &ScaleRequest, options: &ScaleOptions) -> ScaledRecipe {
    let recipe = apply_variants(recipe, &options.variants);
    let (factor, mut warnings) = factor_for(&recipe, request);
    let servings = f64::from(recipe.servings) * factor;

    if let Some(scaling) = &recipe.scaling {
        let below = scaling.min.is_some_and(|m| servings < m - EPSILON);
        let above = scaling.max.is_some_and(|m| servings > m + EPSILON);
        if below || above {
            let mut message = format!(
                "{} servings is outside the suggested range",
                crate::format::format_number(servings, None)
            );
            if let (Some(min), Some(max)) = (scaling.min, scaling.max) {
                message.push_str(&format!(" of {min}-{max}"));
            }
            message.push('.');
            if let Some(note) = &scaling.note {
                message.push(' ');
                message.push_str(note);
            }
            warnings.push(warning("scaling-range", message, None));
        }
    }

    let groups: Vec<ScaledGroup> = recipe
        .ingredient_groups
        .iter()
        .map(|group| ScaledGroup {
            name: group.name.clone(),
            total: group.total.as_ref().map(|t| {
                display_amount(
                    t.qty.min() * factor,
                    t.qty.max() * factor,
                    t.unit,
                    &DisplayCtx {
                        system: Some(options.system),
                        precise: recipe.precise,
                        food: None,
                    },
                )
            }),
            items: group
                .items
                .iter()
                .map(|i| scale_ingredient(i, factor, &recipe, options.system, &mut warnings))
                .collect(),
        })
        .collect();

    let flat: Vec<ScaledIngredient> = groups
        .iter()
        .flat_map(|g| g.items.iter().cloned())
        .collect();
    let changed = (factor - 1.0).abs() > EPSILON;
    let steps = recipe
        .steps
        .iter()
        .map(|step| {
            let parsed = parse_tokens(&step.text);
            let timed =
                step.time.is_some() || parsed.iter().any(|s| matches!(s, Segment::Timer { .. }));
            let segments = render_segments(&parsed, &flat, options.system);
            ScaledStep {
                heading: step.heading.clone(),
                text: render_text(&segments),
                segments,
                key: step.key.clone(),
                time: step.time,
                hint: (changed && timed).then(|| {
                    if factor > 1.0 {
                        "Check from the original time; larger batches may need longer.".to_owned()
                    } else {
                        "Check from the original time; smaller batches may be ready sooner."
                            .to_owned()
                    }
                }),
            }
        })
        .collect();

    let mut hints = Vec::new();
    if factor >= 2.0 - EPSILON {
        hints.push("Cook in batches; do not crowd the pan.".to_owned());
    }
    ScaledRecipe {
        factor,
        servings,
        groups,
        steps,
        tips: recipe.tips.clone(),
        warnings,
        hints,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::parse_recipe;

    fn recipe() -> Recipe {
        parse_recipe(
            r#"{
            "title": "Test bake", "summary": "A test.", "servings": 4,
            "scaling": { "min": 2, "max": 12, "note": "Smaller batches dry out." },
            "pan": { "shape": "round", "size": [20], "depth": 5 },
            "ingredientGroups": [{ "name": "Dough", "total": { "qty": 1000, "unit": "g" }, "items": [
              { "key": "pasta", "amount": { "qty": 300, "unit": "g" }, "item": "short pasta", "note": "penne" },
              { "key": "flour", "food": "flour-00", "amount": { "qty": 300, "unit": "g" }, "item": "flour" },
              { "key": "egg", "each": 50, "amount": { "qty": 3 }, "item": "eggs", "scale": "discrete" },
              { "key": "one", "amount": { "qty": 1 }, "item": "egg", "scale": "discrete" },
              { "key": "salt", "amount": { "qty": 1, "unit": "tsp" }, "item": "salt", "scale": "seasoning" },
              { "key": "bay", "amount": { "qty": 1 }, "item": "bay leaf", "scale": "fixed" },
              { "key": "pepper", "amount": { "qty": 1, "unit": "tsp" }, "item": "pepper", "scale": "toTaste" },
              { "key": "oil", "amount": { "qty": 130, "unit": "ml" }, "alt": { "qty": 9, "unit": "tbsp" }, "item": "olive oil" },
              { "key": "zest", "prefix": "Zest of", "amount": { "qty": 1 }, "item": "lemon", "scale": "discrete" },
              { "item": "water" }
            ]}],
            "steps": [
              { "key": "mix", "text": "Mix {@flour} with {@egg:amount} and half the {@oil*1/2}." },
              { "key": "bake", "text": "Bake at {temp:200/180} for {timer:25-30|loaf}.", "time": { "passive": 30 } },
              { "text": "Rest." }
            ],
            "tips": ["Plain tip."],
            "variants": [{ "key": "fat", "label": "Fat", "options": [
              { "key": "olive", "label": "Olive", "default": true },
              { "key": "butter", "label": "Butter",
                "ingredients": { "oil": { "amount": { "qty": 100, "unit": "g" }, "item": "butter" } },
                "steps": { "mix": "Mix the butter in." }, "tips": ["Butter tip."] }
            ]}]
        }"#,
        )
        .unwrap()
    }

    fn run(request: ScaleRequest) -> ScaledRecipe {
        scale(&recipe(), &request, &ScaleOptions::default())
    }

    fn line<'a>(scaled: &'a ScaledRecipe, key: &str) -> &'a ScaledIngredient {
        scaled
            .groups
            .iter()
            .flat_map(|g| &g.items)
            .find(|i| i.key.as_deref() == Some(key))
            .unwrap()
    }

    fn amount(scaled: &ScaledRecipe, key: &str) -> String {
        line(scaled, key)
            .amount
            .as_ref()
            .map_or_else(String::new, |a| a.text.clone())
    }

    #[test]
    fn linear_doubling_and_hints() {
        let s = run(ScaleRequest::Servings(8.0));
        assert_eq!(s.factor, 2.0);
        assert_eq!(s.servings, 8.0);
        assert_eq!(amount(&s, "pasta"), "600 g");
        assert_eq!(amount(&s, "flour"), "600 g");
        assert_eq!(s.groups[0].total.as_ref().unwrap().text, "2 kg");
        assert!(line(&s, "pasta").scaled);
        assert!(s.hints.iter().any(|h| h.starts_with("Cook in batches")));
        assert!(
            s.steps[1]
                .hint
                .as_deref()
                .unwrap()
                .starts_with("Check from the original time")
        );
        assert!(s.steps[2].hint.is_none());
    }

    #[test]
    fn unchanged_scale_has_no_hints() {
        let s = run(ScaleRequest::Multiplier(1.0));
        assert!(s.hints.is_empty() && s.warnings.is_empty());
        assert!(s.steps.iter().all(|st| st.hint.is_none()));
        assert!(!line(&s, "pasta").scaled);
    }

    #[test]
    fn savoury_discrete_rounds_to_whole_pieces() {
        let half = run(ScaleRequest::Multiplier(0.5));
        assert_eq!(amount(&half, "egg"), "2");
        assert_eq!(amount(&half, "one"), "1");
        assert!(
            half.warnings
                .iter()
                .any(|w| w.code == "discrete-rounding" && w.key.as_deref() == Some("one"))
        );
        assert_eq!(amount(&run(ScaleRequest::Multiplier(1.5)), "zest"), "2");
    }

    #[test]
    fn precise_recipes_show_fractional_eggs_by_weight() {
        let mut r = recipe();
        r.precise = true;
        let s = scale(&r, &ScaleRequest::Multiplier(0.5), &ScaleOptions::default());
        assert_eq!(amount(&s, "egg"), "1½");
        assert_eq!(line(&s, "egg").alt.as_ref().unwrap().text, "75 g");
        assert_eq!(line(&s, "egg").text, "1½ (75 g) eggs");
        assert_eq!(amount(&s, "one"), "1");
    }

    #[test]
    fn seasoning_is_a_range_with_a_hint() {
        let s = run(ScaleRequest::Multiplier(2.0));
        assert_eq!(amount(&s, "salt"), "1½-2 tsp");
        assert_eq!(
            line(&s, "salt").hint.as_deref(),
            Some("start low, then taste")
        );
        let down = run(ScaleRequest::Multiplier(0.5));
        assert_eq!(amount(&down, "salt"), "½ tsp");
        assert!(line(&down, "salt").hint.is_none());
    }

    #[test]
    fn fixed_and_to_taste() {
        let s = run(ScaleRequest::Multiplier(3.0));
        assert_eq!(amount(&s, "bay"), "1");
        assert!(!line(&s, "bay").scaled);
        let pepper = line(&s, "pepper");
        assert!(pepper.amount.is_none() && pepper.to_taste);
        assert_eq!(pepper.text, "pepper, to taste");
        assert_eq!(line(&s, "zest").text, "Zest of 3 lemon");
    }

    #[test]
    fn author_alt_wins_and_scales_with_the_primary() {
        let s = run(ScaleRequest::Multiplier(2.0));
        assert_eq!(line(&s, "oil").text, "250 ml (18 tbsp) olive oil");
        let us = scale(
            &recipe(),
            &ScaleRequest::Multiplier(1.0),
            &ScaleOptions {
                system: UnitSystem::Us,
                ..Default::default()
            },
        );
        assert_eq!(line(&us, "oil").text, "130 ml (9 tbsp) olive oil");
    }

    #[test]
    fn an_alt_that_reads_like_the_amount_is_dropped() {
        let recipe = crate::schema::parse_recipe(
            r#"{"title":"Roast","summary":"s","servings":2,
            "ingredientGroups":[{"items":[{"key":"beef","amount":{"qty":1000,"unit":"g"},
                "alt":{"qty":1,"unit":"kg"},"item":"beef fillet"}]}],
            "steps":[{"text":"Roast {@beef}."}]}"#,
        )
        .unwrap();
        let s = scale(
            &recipe,
            &ScaleRequest::Multiplier(1.0),
            &ScaleOptions::default(),
        );
        let beef = &s.groups[0].items[0];
        assert!(beef.alt.is_none());
        assert_eq!(beef.text, "1 kg beef fillet");
    }

    #[test]
    fn notes_and_lines() {
        let s = run(ScaleRequest::Multiplier(1.0));
        assert_eq!(line(&s, "pasta").text, "300 g short pasta, penne");
        assert_eq!(s.groups[0].items.last().unwrap().text, "water");
    }

    #[test]
    fn scaling_by_what_you_have() {
        let s = run(ScaleRequest::Have {
            key: "flour".into(),
            qty: 450.0,
            unit: Some(Unit::G),
        });
        assert_eq!(s.factor, 1.5);
        assert_eq!(s.servings, 6.0);
        let lb = run(ScaleRequest::Have {
            key: "flour".into(),
            qty: 0.5,
            unit: Some(Unit::Kg),
        });
        assert!((lb.factor - 500.0 / 300.0).abs() < 1e-9);
        let bad = run(ScaleRequest::Have {
            key: "nope".into(),
            qty: 1.0,
            unit: None,
        });
        assert_eq!(bad.factor, 1.0);
        assert_eq!(bad.warnings[0].code, "have-unknown");
        let mismatched = run(ScaleRequest::Have {
            key: "egg".into(),
            qty: 1.0,
            unit: Some(Unit::G),
        });
        assert_eq!(mismatched.warnings[0].code, "units-incompatible");
    }

    #[test]
    fn scaling_by_pan() {
        let pan = |shape, size: Vec<f64>, depth| Pan { shape, size, depth };
        let same = run(ScaleRequest::Pan(pan(
            crate::schema::PanShape::Round,
            vec![20.0],
            Some(5.0),
        )));
        assert!((same.factor - 1.0).abs() < 1e-9 && same.warnings.is_empty());
        let bigger = run(ScaleRequest::Pan(pan(
            crate::schema::PanShape::Round,
            vec![23.0],
            Some(5.0),
        )));
        assert!((bigger.factor - 1.3225).abs() < 1e-9);
        let square = run(ScaleRequest::Pan(pan(
            crate::schema::PanShape::Square,
            vec![20.0],
            Some(7.0),
        )));
        assert!((square.factor - 400.0 / (std::f64::consts::PI * 100.0)).abs() < 1e-9);
        assert_eq!(square.warnings[0].code, "pan-depth");
        let mut plain = recipe();
        plain.pan = None;
        let s = scale(
            &plain,
            &ScaleRequest::Pan(pan(crate::schema::PanShape::Round, vec![23.0], None)),
            &ScaleOptions::default(),
        );
        assert_eq!((s.factor, s.warnings[0].code), (1.0, "pan-missing"));
    }

    #[test]
    fn range_warning_never_blocks() {
        let s = run(ScaleRequest::Servings(20.0));
        assert_eq!(s.factor, 5.0);
        let w = s
            .warnings
            .iter()
            .find(|w| w.code == "scaling-range")
            .unwrap();
        assert!(w.message.contains("2-12") && w.message.contains("dry out"));
        assert!(
            run(ScaleRequest::Servings(6.0))
                .warnings
                .iter()
                .all(|w| w.code != "scaling-range")
        );
    }

    #[test]
    fn invalid_factors_fall_back_to_one() {
        for bad in [0.0, -2.0, f64::NAN, f64::INFINITY] {
            let s = run(ScaleRequest::Multiplier(bad));
            assert_eq!(s.factor, 1.0);
            assert_eq!(s.warnings[0].code, "scale-invalid");
        }
    }

    #[test]
    fn variants_replace_by_key() {
        let default = run(ScaleRequest::Multiplier(1.0));
        assert_eq!(line(&default, "oil").text, "130 ml (9 tbsp) olive oil");
        assert_eq!(default.tips, vec!["Plain tip."]);
        let options = ScaleOptions {
            variants: BTreeMap::from([("fat".to_owned(), "butter".to_owned())]),
            ..Default::default()
        };
        let butter = scale(&recipe(), &ScaleRequest::Multiplier(1.0), &options);
        assert_eq!(line(&butter, "oil").text, "100 g butter");
        assert_eq!(butter.steps[0].text, "Mix the butter in.");
        assert_eq!(butter.tips, vec!["Butter tip."]);
    }

    #[test]
    fn step_tokens_follow_the_scale() {
        let s = run(ScaleRequest::Multiplier(2.0));
        assert_eq!(
            s.steps[0].text,
            "Mix 600 g flour with 6 and half the 130 ml olive oil."
        );
        assert_eq!(
            s.steps[1].text,
            "Bake at 200 °C (180 °C fan) for 25-30 min."
        );
        let us = scale(
            &recipe(),
            &ScaleRequest::Multiplier(1.0),
            &ScaleOptions {
                system: UnitSystem::Us,
                ..Default::default()
            },
        );
        assert!(us.steps[0].text.starts_with("Mix 2½ cups flour"));
        assert!(us.steps[1].text.starts_with("Bake at 400 °F (350 °F fan)"));
    }

    #[test]
    fn pinch_reads_naturally() {
        let mut r = recipe();
        r.ingredient_groups[0].items[4].amount = Some(Amount {
            qty: crate::schema::Qty::Single(0.1),
            unit: Some(Unit::Tsp),
        });
        r.ingredient_groups[0].items[4].scale = None;
        let s = scale(&r, &ScaleRequest::Multiplier(1.0), &ScaleOptions::default());
        assert_eq!(line(&s, "salt").text, "a pinch of salt");
    }
}
