use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Section {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Recipe {
    pub title: String,
    pub summary: String,
    pub servings: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub servings_noun: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_local: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scaling: Option<Scaling>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub precise: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pan: Option<Pan>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub times: Option<Times>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub difficulty: Option<Difficulty>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<Image>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub equipment: Vec<String>,
    pub ingredient_groups: Vec<IngredientGroup>,
    pub steps: Vec<Step>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tips: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variants: Vec<Variant>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub related: Vec<String>,
}

impl Recipe {
    pub fn ingredients(&self) -> impl Iterator<Item = &Ingredient> {
        self.ingredient_groups.iter().flat_map(|g| g.items.iter())
    }

    pub fn find_ingredient(&self, key: &str) -> Option<&Ingredient> {
        self.ingredients().find(|i| i.key.as_deref() == Some(key))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IngredientGroup {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<Amount>,
    pub items: Vec<Ingredient>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Ingredient {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub food: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub each: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<Amount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<Amount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub optional: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scale: Option<ScaleMode>,
}

impl Ingredient {
    pub fn mode(&self) -> ScaleMode {
        self.scale.unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Amount {
    pub qty: Qty,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<Unit>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum Qty {
    Single(f64),
    Range(QtyRange),
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct QtyRange {
    pub min: f64,
    pub max: f64,
}

impl Qty {
    pub fn min(&self) -> f64 {
        match self {
            Qty::Single(q) => *q,
            Qty::Range(r) => r.min,
        }
    }

    pub fn max(&self) -> f64 {
        match self {
            Qty::Single(q) => *q,
            Qty::Range(r) => r.max,
        }
    }

    pub fn midpoint(&self) -> f64 {
        (self.min() + self.max()) / 2.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Unit {
    G,
    Kg,
    Ml,
    L,
    Tsp,
    Tbsp,
    Cup,
    Oz,
    Lb,
    Floz,
    Pinch,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ScaleMode {
    #[default]
    Linear,
    Discrete,
    Seasoning,
    Fixed,
    ToTaste,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Step {
    /// Starts a new titled stage of the method, e.g. "Day 1: the night before".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<String>,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<StepTime>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct StepTime {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passive: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Variant {
    pub key: String,
    pub label: String,
    pub options: Vec<VariantOption>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VariantOption {
    pub key: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<bool>,
    /// Replacement ingredients, keyed by the key of the ingredient they replace.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ingredients: BTreeMap<String, Ingredient>,
    /// Replacement step texts, keyed by the key of the step they replace.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub steps: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tips: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Pan {
    pub shape: PanShape,
    /// Centimetres: `[diameter]` for round, `[side]` or `[width, length]` for square, `[width, length]` for rect.
    pub size: Vec<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth: Option<f64>,
}

impl Pan {
    pub fn area(&self) -> Option<f64> {
        let first = *self.size.first()?;
        let area = match self.shape {
            PanShape::Round => std::f64::consts::PI * (first / 2.0).powi(2),
            PanShape::Square => first * self.size.get(1).copied().unwrap_or(first),
            PanShape::Rect => first * *self.size.get(1)?,
        };
        (area.is_finite() && area > 0.0).then_some(area)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum PanShape {
    Round,
    Square,
    Rect,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Scaling {
    /// Smallest sensible number of servings.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    /// Largest sensible number of servings.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Image {
    /// Relative to the recipe file.
    pub src: String,
    #[serde(default)]
    pub alt: String,
}

/// Minutes.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Times {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prep: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cook: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rest: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

pub fn parse_recipe(json: &str) -> Result<Recipe, serde_json::Error> {
    serde_json::from_str(json)
}

pub fn parse_section(json: &str) -> Result<Section, serde_json::Error> {
    serde_json::from_str(json)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL: &str = r#"{
        "title": "Toast", "summary": "Bread, heated.", "servings": 2,
        "ingredientGroups": [{ "items": [{ "key": "bread", "amount": { "qty": { "min": 2, "max": 3 } }, "item": "slices" }] }],
        "steps": [{ "text": "Toast {@bread}.", "time": { "active": 3 } }]
    }"#;

    #[test]
    fn parses_minimal_recipe_and_round_trips() {
        let recipe = parse_recipe(MINIMAL).unwrap();
        assert_eq!(recipe.servings, 2);
        assert_eq!(
            recipe.ingredient_groups[0].items[0]
                .amount
                .as_ref()
                .unwrap()
                .qty,
            Qty::Range(QtyRange { min: 2.0, max: 3.0 })
        );
        let again: Recipe = serde_json::from_str(&serde_json::to_string(&recipe).unwrap()).unwrap();
        assert_eq!(recipe, again);
    }

    #[test]
    fn rejects_unknown_fields() {
        let bad = MINIMAL.replace("\"servings\": 2", "\"servings\": 2, \"servngs\": 3");
        assert!(parse_recipe(&bad).is_err());
    }

    #[test]
    fn scale_mode_uses_camel_case() {
        let mode: ScaleMode = serde_json::from_str("\"toTaste\"").unwrap();
        assert_eq!(mode, ScaleMode::ToTaste);
        assert_eq!(serde_json::to_string(&Unit::Floz).unwrap(), "\"floz\"");
    }

    #[test]
    fn pan_areas() {
        let round = Pan {
            shape: PanShape::Round,
            size: vec![20.0],
            depth: None,
        };
        let square = Pan {
            shape: PanShape::Square,
            size: vec![20.0],
            depth: None,
        };
        let rect = Pan {
            shape: PanShape::Rect,
            size: vec![20.0],
            depth: None,
        };
        assert!((round.area().unwrap() - 314.159).abs() < 0.01);
        assert_eq!(square.area(), Some(400.0));
        assert_eq!(rect.area(), None);
    }

    #[test]
    fn missing_alt_defaults_to_empty() {
        let image: Image = serde_json::from_str(r#"{ "src": "a.jpg" }"#).unwrap();
        assert!(image.alt.is_empty());
    }
}
