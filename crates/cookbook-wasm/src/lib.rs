use cookbook_core as core;
use serde::Serialize;
use wasm_bindgen::prelude::*;

fn serializer() -> serde_wasm_bindgen::Serializer {
    serde_wasm_bindgen::Serializer::new()
        .serialize_maps_as_objects(true)
        .serialize_missing_as_null(true)
}

fn to_js(value: &impl Serialize) -> Result<JsValue, JsError> {
    value
        .serialize(&serializer())
        .map_err(|e| JsError::new(&e.to_string()))
}

fn from_js<T: serde::de::DeserializeOwned>(value: JsValue) -> Result<T, JsError> {
    serde_wasm_bindgen::from_value(value).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// `request` and `options` are optional: they default to the written servings in metric units.
#[wasm_bindgen]
pub fn scale_recipe(
    recipe: JsValue,
    request: JsValue,
    options: JsValue,
) -> Result<JsValue, JsError> {
    let recipe: core::Recipe = from_js(recipe)?;
    let request = if request.is_null() || request.is_undefined() {
        core::ScaleRequest::Multiplier(1.0)
    } else {
        from_js(request)?
    };
    let options = if options.is_null() || options.is_undefined() {
        core::ScaleOptions::default()
    } else {
        from_js(options)?
    };
    to_js(&core::scale(&recipe, &request, &options))
}

#[wasm_bindgen]
pub fn parse_ingredient_line(line: &str) -> Result<JsValue, JsError> {
    let ingredient = core::parse_ingredient_line(line).map_err(|e| JsError::new(&e.to_string()))?;
    to_js(&ingredient)
}

/// `context` carries `knownIds`, `sectionFolders` and optionally `files`.
#[wasm_bindgen]
pub fn check_recipe(recipe: JsValue, id: &str, context: JsValue) -> Result<JsValue, JsError> {
    let file = core::RecipeFile {
        path: format!("{id}.json"),
        recipe: from_js(recipe)?,
    };
    let context: core::CheckContext = if context.is_null() || context.is_undefined() {
        core::CheckContext::default()
    } else {
        from_js(context)?
    };
    to_js(&core::check_recipe(&file, &context))
}

/// `recipes` lists every recipe in the collection as `{ path, recipe }`.
#[wasm_bindgen]
pub fn check_removal(id: &str, recipes: JsValue) -> Result<JsValue, JsError> {
    let collection = core::Collection {
        recipes: from_js(recipes)?,
        ..core::Collection::default()
    };
    to_js(&core::check_removal(id, &collection))
}

#[wasm_bindgen]
pub struct SearchEngine {
    index: core::SearchIndex,
}

#[wasm_bindgen]
impl SearchEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(index_json: &str) -> Result<SearchEngine, JsError> {
        let index = serde_json::from_str(index_json).map_err(|e| JsError::new(&e.to_string()))?;
        Ok(SearchEngine { index })
    }

    pub fn search(&self, query: &str) -> Result<JsValue, JsError> {
        to_js(&self.index.search(query))
    }

    #[wasm_bindgen(js_name = ingredientsIHave)]
    pub fn ingredients_i_have(&self, have: Vec<String>) -> Result<JsValue, JsError> {
        let have: Vec<&str> = have.iter().map(String::as_str).collect();
        to_js(&self.index.ingredients_i_have(&have))
    }
}

/// The next unit in the click-to-toggle cycle, as `{ qty, unit }`, or `undefined` for a pinch.
#[wasm_bindgen]
pub fn toggle_unit(qty: f64, unit: JsValue) -> Result<JsValue, JsError> {
    let unit: core::Unit = from_js(unit)?;
    match core::toggle_unit(qty, unit) {
        Some((qty, unit)) => to_js(&serde_json::json!({ "qty": qty, "unit": unit })),
        None => Ok(JsValue::UNDEFINED),
    }
}

/// Renders an oven temperature such as "200 °C (180 °C fan)" for the chosen system ("metric" or "us").
#[wasm_bindgen]
pub fn format_temperature(
    celsius: f64,
    fan_celsius: Option<f64>,
    system: JsValue,
) -> Result<String, JsError> {
    Ok(core::temp_text(celsius, fan_celsius, from_js(system)?))
}

/// Converts between units; `food` selects a density for mass to volume. `undefined` when impossible.
#[wasm_bindgen]
pub fn convert(
    qty: f64,
    from: JsValue,
    to: JsValue,
    food: Option<String>,
) -> Result<Option<f64>, JsError> {
    Ok(core::convert(
        qty,
        from_js(from)?,
        from_js(to)?,
        food.as_deref(),
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_not_empty() {
        assert!(!super::version().is_empty());
    }
}
