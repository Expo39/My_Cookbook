//! Reduces the recipe's JSON Schema to the OpenAPI subset that Gemini's `responseSchema` accepts.

use cookbook_core::{Recipe, food_ids};
use serde_json::{Map, Value, json};

/// Properties the importer does not ask for: they need the rest of the collection or open-ended maps.
const OMITTED: &[&str] = &["variants", "related", "image", "order"];

/// The only keywords the reduced schema may contain.
#[cfg(test)]
const ALLOWED_KEYWORDS: &[&str] = &[
    "type",
    "format",
    "description",
    "nullable",
    "enum",
    "properties",
    "required",
    "items",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "anyOf",
];

const MAX_DEPTH: usize = 24;

pub fn import_schema() -> Value {
    let root = serde_json::to_value(schemars::schema_for!(Recipe)).unwrap_or(Value::Null);
    let defs = root.get("$defs").cloned().unwrap_or(Value::Null);
    let mut schema = reduce(&root, &defs, 0);
    if let Some(properties) = schema.get_mut("properties").and_then(Value::as_object_mut) {
        for name in OMITTED {
            properties.remove(*name);
        }
    }
    if let Some(required) = schema.get_mut("required").and_then(Value::as_array_mut) {
        required.retain(|r| r.as_str().is_none_or(|r| !OMITTED.contains(&r)));
    }
    limit_foods(&mut schema);
    schema
}

/// Ingredient objects are found by their `food` property. A free-text `food` lets a small model
/// invent ids the density table does not know, so the schema offers only the ones it does; and
/// `item` is required, so a line cannot come back as a nameless piece (an amount or a prefix alone).
fn limit_foods(node: &mut Value) {
    match node {
        Value::Object(object) => {
            let ingredient = object
                .get("properties")
                .is_some_and(|properties| properties.get("food").is_some());
            if ingredient {
                if let Some(food) = object
                    .get_mut("properties")
                    .and_then(|properties| properties.get_mut("food"))
                    .and_then(Value::as_object_mut)
                {
                    food.insert("enum".into(), json!(food_ids().collect::<Vec<_>>()));
                }
                let required = object.entry("required").or_insert_with(|| json!([]));
                if let Some(required) = required.as_array_mut()
                    && !required.iter().any(|name| name == "item")
                {
                    required.push(json!("item"));
                }
            }
            for child in object.values_mut() {
                limit_foods(child);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(limit_foods),
        _ => {}
    }
}

fn resolve<'a>(node: &'a Value, defs: &'a Value) -> &'a Value {
    node.get("$ref")
        .and_then(Value::as_str)
        .and_then(|r| r.strip_prefix("#/$defs/"))
        .and_then(|name| defs.get(name))
        .unwrap_or(node)
}

fn is_null(node: &Value) -> bool {
    node.get("type").and_then(Value::as_str) == Some("null")
}

fn reduce(node: &Value, defs: &Value, depth: usize) -> Value {
    let node = resolve(node, defs);
    let Some(object) = node.as_object() else {
        return json!({});
    };
    if depth > MAX_DEPTH {
        return json!({ "type": "string" });
    }
    let mut out = Map::new();
    let mut nullable = false;

    match object.get("type") {
        Some(Value::String(t)) if t != "null" => {
            out.insert("type".into(), json!(t));
        }
        Some(Value::Array(types)) => {
            nullable = types.iter().any(|t| t == "null");
            if let Some(t) = types.iter().find(|t| *t != "null") {
                out.insert("type".into(), t.clone());
            }
        }
        _ => {}
    }

    for key in ["description", "minimum", "maximum", "minItems", "maxItems"] {
        if let Some(value) = object.get(key) {
            out.insert(key.into(), value.clone());
        }
    }
    if let Some(Value::String(format)) = object.get("format")
        && matches!(format.as_str(), "int32" | "int64" | "float" | "double")
    {
        out.insert("format".into(), json!(format));
    }

    if let Some(values) = object.get("enum") {
        out.insert("enum".into(), values.clone());
        out.entry("type").or_insert(json!("string"));
    }
    if let Some(constant) = object.get("const") {
        out.insert("enum".into(), json!([constant]));
        out.entry("type").or_insert(json!("string"));
    }

    if let Some(properties) = object.get("properties").and_then(Value::as_object) {
        let reduced: Map<String, Value> = properties
            .iter()
            .map(|(name, child)| (name.clone(), reduce(child, defs, depth + 1)))
            .collect();
        out.insert("type".into(), json!("object"));
        out.insert("properties".into(), Value::Object(reduced));
        if let Some(required) = object.get("required") {
            out.insert("required".into(), required.clone());
        }
    }
    if let Some(items) = object.get("items") {
        out.insert("type".into(), json!("array"));
        out.insert("items".into(), reduce(items, defs, depth + 1));
    }

    for key in ["anyOf", "oneOf"] {
        let Some(branches) = object.get(key).and_then(Value::as_array) else {
            continue;
        };
        let resolved: Vec<&Value> = branches.iter().map(|b| resolve(b, defs)).collect();
        nullable |= resolved.iter().any(|b| is_null(b));
        let live: Vec<&Value> = resolved.into_iter().filter(|b| !is_null(b)).collect();
        let constants: Vec<&Value> = live.iter().filter_map(|b| b.get("const")).collect();
        if !live.is_empty() && constants.len() == live.len() {
            out.insert("type".into(), json!("string"));
            out.insert("enum".into(), json!(constants));
        } else if live.len() == 1 {
            if let Some(single) = reduce(live[0], defs, depth + 1).as_object() {
                for (k, v) in single {
                    out.entry(k.clone()).or_insert(v.clone());
                }
            }
        } else if !live.is_empty() {
            let reduced: Vec<Value> = live.iter().map(|b| reduce(b, defs, depth + 1)).collect();
            out.insert("anyOf".into(), Value::Array(reduced));
        }
    }

    if nullable {
        out.insert("nullable".into(), json!(true));
    }
    Value::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn walk(node: &Value, visit: &mut impl FnMut(&str, &Value)) {
        match node {
            Value::Object(map) => {
                for (key, value) in map {
                    visit(key, value);
                    if key == "properties" {
                        for child in value.as_object().into_iter().flat_map(Map::values) {
                            walk(child, visit);
                        }
                    } else {
                        walk(value, visit);
                    }
                }
            }
            Value::Array(items) => items.iter().for_each(|i| walk(i, visit)),
            _ => {}
        }
    }

    #[test]
    fn only_supported_keywords_remain() {
        let schema = import_schema();
        walk(&schema, &mut |key, _| {
            assert!(
                ALLOWED_KEYWORDS.contains(&key) || is_property_name(&schema, key),
                "unsupported keyword {key}"
            );
        });
    }

    fn is_property_name(schema: &Value, key: &str) -> bool {
        let mut found = false;
        walk(schema, &mut |k, v| {
            if k == "properties" && v.get(key).is_some() {
                found = true;
            }
        });
        found
    }

    #[test]
    fn nothing_is_left_unresolved() {
        let text = import_schema().to_string();
        assert!(!text.contains("$ref") && !text.contains("$defs"));
        assert!(!text.contains("additionalProperties"));
    }

    #[test]
    fn the_top_level_is_a_recipe_object() {
        let schema = import_schema();
        assert_eq!(schema["type"], "object");
        let properties = schema["properties"].as_object().unwrap();
        for name in ["title", "summary", "servings", "ingredientGroups", "steps"] {
            assert!(properties.contains_key(name), "missing {name}");
        }
        for name in OMITTED {
            assert!(!properties.contains_key(*name), "{name} should be omitted");
        }
        let required = schema["required"].as_array().unwrap();
        assert!(required.iter().any(|r| r == "steps"));
    }

    #[test]
    fn food_offers_only_the_ids_the_density_table_knows() {
        let schema = import_schema();
        let food = &schema["properties"]["ingredientGroups"]["items"]["properties"]["items"]["items"]
            ["properties"]["food"];
        let ids = food["enum"].as_array().unwrap();
        assert!(ids.iter().any(|id| id == "olive-oil"));
        assert!(
            ids.iter()
                .all(|id| cookbook_core::density(id.as_str().unwrap()).is_some())
        );
    }

    #[test]
    fn units_become_a_string_enum() {
        let schema = import_schema();
        let unit = &schema["properties"]["ingredientGroups"]["items"]["properties"]["items"]["items"]
            ["properties"]["amount"]["properties"]["unit"];
        assert_eq!(unit["type"], "string");
        assert!(unit["enum"].as_array().unwrap().iter().any(|u| u == "tbsp"));
    }

    #[test]
    fn quantities_allow_a_number_or_a_range() {
        let schema = import_schema();
        let qty = &schema["properties"]["ingredientGroups"]["items"]["properties"]["items"]["items"]
            ["properties"]["amount"]["properties"]["qty"];
        assert_eq!(qty["anyOf"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn objects_always_have_properties() {
        fn check(node: &Value) {
            match node {
                Value::Object(map) => {
                    if map.get("type") == Some(&json!("object")) {
                        let properties = map.get("properties").and_then(Value::as_object);
                        assert!(properties.is_some_and(|p| !p.is_empty()), "bare object");
                    }
                    for (key, child) in map {
                        if key == "properties" {
                            child
                                .as_object()
                                .into_iter()
                                .flat_map(Map::values)
                                .for_each(check);
                        } else {
                            check(child);
                        }
                    }
                }
                Value::Array(items) => items.iter().for_each(check),
                _ => {}
            }
        }
        check(&import_schema());
    }
}
