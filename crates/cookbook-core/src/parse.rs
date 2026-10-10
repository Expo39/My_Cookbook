use thiserror::Error;

use crate::schema::{Amount, Ingredient, Qty, QtyRange, ScaleMode, Unit};

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum IngredientParseError {
    #[error("the ingredient line is empty")]
    Empty,
    #[error("no ingredient name found in '{0}'")]
    MissingItem(String),
}

fn vulgar(c: char) -> Option<f64> {
    Some(match c {
        '½' => 0.5,
        '⅓' => 1.0 / 3.0,
        '⅔' => 2.0 / 3.0,
        '¼' => 0.25,
        '¾' => 0.75,
        '⅛' => 0.125,
        '⅜' => 0.375,
        '⅝' => 0.625,
        '⅞' => 0.875,
        _ => return None,
    })
}

fn digits_end(s: &str, allow_dot: bool) -> usize {
    s.find(|c: char| !(c.is_ascii_digit() || (allow_dot && c == '.')))
        .unwrap_or(s.len())
}

fn fraction_at(s: &str) -> Option<(f64, &str)> {
    let n_end = digits_end(s, false);
    let rest = s[n_end..].strip_prefix('/')?;
    let d_end = digits_end(rest, false);
    let (n, d): (f64, f64) = (s[..n_end].parse().ok()?, rest[..d_end].parse().ok()?);
    (d > 0.0).then_some((n / d, &rest[d_end..]))
}

fn parse_quantity(s: &str) -> Option<(f64, &str)> {
    let s = s.trim_start();
    let first = s.chars().next()?;
    if let Some(v) = vulgar(first) {
        return Some((v, &s[first.len_utf8()..]));
    }
    if !first.is_ascii_digit() {
        return None;
    }
    if let Some(found) = fraction_at(s) {
        return Some(found);
    }
    let end = digits_end(s, true);
    let whole: f64 = s[..end].parse().ok()?;
    let rest = &s[end..];
    if let Some(c) = rest.chars().next()
        && let Some(v) = vulgar(c)
    {
        return Some((whole + v, &rest[c.len_utf8()..]));
    }
    let spaced = rest.trim_start();
    if spaced.len() != rest.len() {
        if let Some(c) = spaced.chars().next()
            && let Some(v) = vulgar(c)
        {
            return Some((whole + v, &spaced[c.len_utf8()..]));
        }
        if let Some((frac, after)) = fraction_at(spaced) {
            return Some((whole + frac, after));
        }
    }
    Some((whole, rest))
}

fn parse_range(s: &str) -> Option<(f64, f64, &str)> {
    let (lo, rest) = parse_quantity(s)?;
    let after = rest.trim_start();
    let hi = after
        .strip_prefix(['-', '\u{2013}', '\u{2014}'])
        .or_else(|| after.strip_prefix("to "))
        .and_then(parse_quantity);
    match hi {
        Some((hi, rest)) if hi > lo => Some((lo, hi, rest)),
        _ => Some((lo, lo, rest)),
    }
}

const UNIT_WORDS: &[(Unit, &[&str])] = &[
    (Unit::G, &["g", "gr", "gram", "grams", "gramme", "grammes"]),
    (
        Unit::Kg,
        &[
            "kg",
            "kgs",
            "kilo",
            "kilos",
            "kilogram",
            "kilograms",
            "kilogramme",
            "kilogrammes",
        ],
    ),
    (
        Unit::Ml,
        &[
            "ml",
            "mls",
            "millilitre",
            "millilitres",
            "milliliter",
            "milliliters",
        ],
    ),
    (Unit::L, &["l", "litre", "litres", "liter", "liters", "ltr"]),
    (Unit::Tsp, &["tsp", "tsps", "teaspoon", "teaspoons"]),
    (
        Unit::Tbsp,
        &["tbsp", "tbsps", "tbs", "tablespoon", "tablespoons"],
    ),
    (Unit::Cup, &["cup", "cups"]),
    (Unit::Oz, &["oz", "ounce", "ounces"]),
    (Unit::Lb, &["lb", "lbs", "pound", "pounds"]),
    (Unit::Floz, &["floz"]),
    (Unit::Pinch, &["pinch", "pinches"]),
];

fn parse_unit(s: &str) -> Option<(Unit, &str)> {
    let s = s.trim_start();
    let lower = s.to_lowercase();
    for prefix in ["fl oz", "fl. oz", "fluid ounces", "fluid ounce"] {
        if lower.starts_with(prefix) {
            return Some((Unit::Floz, s.get(prefix.len()..)?));
        }
    }
    let end = s.find(|c: char| !c.is_alphabetic()).unwrap_or(s.len());
    let word = s[..end].to_lowercase();
    let unit = UNIT_WORDS
        .iter()
        .find(|(_, words)| words.contains(&word.as_str()))
        .map(|(unit, _)| *unit)?;
    let rest = &s[end..];
    Some((unit, rest.strip_prefix('.').unwrap_or(rest)))
}

fn parse_amount_text(s: &str) -> Option<Amount> {
    let (lo, hi, rest) = parse_range(s)?;
    let unit = match parse_unit(rest) {
        Some((unit, after)) if after.trim().is_empty() => Some(unit),
        _ => return None,
    };
    unit.map(|unit| amount(lo, hi, Some(unit)))
}

fn amount(lo: f64, hi: f64, unit: Option<Unit>) -> Amount {
    Amount {
        qty: if hi > lo {
            Qty::Range(QtyRange { min: lo, max: hi })
        } else {
            Qty::Single(lo)
        },
        unit,
    }
}

fn strip_suffix_ci<'a>(s: &'a str, suffix: &str) -> Option<&'a str> {
    let cut = s.len().checked_sub(suffix.len())?;
    (s.is_char_boundary(cut) && s[cut..].eq_ignore_ascii_case(suffix)).then(|| &s[..cut])
}

fn trim_trailing_punctuation(s: &str) -> &str {
    s.trim_end_matches(|c: char| c.is_whitespace() || matches!(c, ',' | ';' | '.' | '-'))
}

fn lower_first(s: &str) -> String {
    let mut chars = s.chars();
    match (chars.next(), chars.next()) {
        (Some(a), Some(b)) if a.is_uppercase() && b.is_lowercase() => a
            .to_lowercase()
            .chain(std::iter::once(b))
            .chain(chars)
            .collect(),
        _ => s.to_owned(),
    }
}

const PREFIXES: &[&str] = &[
    "finely grated zest of",
    "grated zest of",
    "zest and juice of",
    "juice and zest of",
    "zest of",
    "juice of",
];

/// Parses a free-text line such as "130ml (9tbsp) olive oil" into an ingredient.
pub fn parse_ingredient_line(line: &str) -> Result<Ingredient, IngredientParseError> {
    let collapsed = line.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut text = collapsed
        .trim_start_matches(['-', '\u{2022}', '*'])
        .trim()
        .to_owned();
    if text.is_empty() {
        return Err(IngredientParseError::Empty);
    }

    let mut brackets = Vec::new();
    while let Some(open) = text.find('(') {
        let Some(close) = text[open..].find(')').map(|i| open + i) else {
            break;
        };
        brackets.push(text[open + 1..close].trim().to_owned());
        text.replace_range(open..=close, " ");
    }

    let mut optional = false;
    let mut to_taste = false;
    loop {
        let trimmed = trim_trailing_punctuation(&text);
        if let Some(rest) = strip_suffix_ci(trimmed, "to taste") {
            to_taste = true;
            text = rest.to_owned();
        } else if let Some(rest) = strip_suffix_ci(trimmed, "optional") {
            optional = true;
            text = rest.to_owned();
        } else {
            text = trimmed.to_owned();
            break;
        }
    }
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");

    let (head, comma_note) = match text.split_once(',') {
        Some((head, note)) => (head.trim(), Some(note.trim().to_owned())),
        None => (text.as_str(), None),
    };

    let lower = head.to_lowercase();
    let prefix = PREFIXES
        .iter()
        .find(|p| lower.starts_with(*p) && head[p.len()..].starts_with(' '))
        .map(|p| &head[..p.len()]);
    let body = prefix.map_or(head, |p| head[p.len()..].trim_start());

    let mut parsed_amount = None;
    let mut scale = None;
    let mut item = body.to_owned();
    let body_lower = body.to_lowercase();
    if let Some(rest) = ["a pinch", "pinch"].iter().find_map(|p| {
        let rest = body.get(p.len()..)?;
        (body_lower.starts_with(p) && (rest.is_empty() || rest.starts_with(' '))).then_some(rest)
    }) {
        parsed_amount = Some(amount(1.0, 1.0, Some(Unit::Pinch)));
        item = rest
            .trim_start()
            .strip_prefix("of ")
            .unwrap_or(rest.trim_start())
            .to_owned();
    } else if let Some((lo, hi, rest)) = parse_range(body) {
        if let Some((unit, after)) = parse_unit(rest) {
            parsed_amount = Some(amount(lo, hi, Some(unit)));
            let after = after.trim_start();
            item = after.strip_prefix("of ").unwrap_or(after).to_owned();
        } else {
            parsed_amount = Some(amount(lo, hi, None));
            let rest = rest.trim_start();
            item = match rest.strip_prefix(['x', '\u{00d7}']) {
                Some(tail) if tail.starts_with(' ') => format!("x {}", tail.trim_start()),
                _ => rest.to_owned(),
            };
            scale = Some(ScaleMode::Discrete);
        }
    }
    let item = lower_first(item.trim());
    if item.is_empty() {
        return Err(IngredientParseError::MissingItem(collapsed));
    }

    let mut alt = None;
    let mut notes = Vec::new();
    for content in brackets {
        if content.eq_ignore_ascii_case("optional") {
            optional = true;
        } else if content.eq_ignore_ascii_case("to taste") {
            to_taste = true;
        } else if alt.is_none()
            && parsed_amount.as_ref().is_some_and(|a| a.unit.is_some())
            && let Some(found) = parse_amount_text(&content)
        {
            alt = Some(found);
        } else if !content.is_empty() {
            notes.push(content);
        }
    }
    notes.extend(comma_note.filter(|n| !n.is_empty()));

    if to_taste {
        scale = Some(ScaleMode::ToTaste);
    }
    Ok(Ingredient {
        amount: parsed_amount,
        alt,
        prefix: prefix.map(str::to_owned),
        item: Some(item),
        note: (!notes.is_empty()).then(|| notes.join(", ")),
        optional,
        scale,
        ..Ingredient::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_ingredient_lines() {
        let cases = [
            (
                "600g short pasta (penne, rigatoni)",
                json!({"amount": {"qty": 600, "unit": "g"}, "item": "short pasta", "note": "penne, rigatoni"}),
            ),
            (
                "1½ tbsp melted butter",
                json!({"amount": {"qty": 1.5, "unit": "tbsp"}, "item": "melted butter"}),
            ),
            (
                "2-3 garlic cloves, minced",
                json!({"amount": {"qty": {"min": 2, "max": 3}}, "item": "garlic cloves", "note": "minced", "scale": "discrete"}),
            ),
            (
                "Zest of 1 lemon",
                json!({"prefix": "Zest of", "amount": {"qty": 1}, "item": "lemon", "scale": "discrete"}),
            ),
            ("Salt to taste", json!({"item": "salt", "scale": "toTaste"})),
            (
                "130ml (9tbsp) olive oil",
                json!({"amount": {"qty": 130, "unit": "ml"}, "alt": {"qty": 9, "unit": "tbsp"}, "item": "olive oil"}),
            ),
            (
                "1 x 400g tin tomatoes",
                json!({"amount": {"qty": 1}, "item": "x 400g tin tomatoes", "scale": "discrete"}),
            ),
            (
                "2 x 400 g tins chopped tomatoes",
                json!({"amount": {"qty": 2}, "item": "x 400 g tins chopped tomatoes", "scale": "discrete"}),
            ),
            (
                "2 eggs",
                json!({"amount": {"qty": 2}, "item": "eggs", "scale": "discrete"}),
            ),
            (
                "500 g plain flour",
                json!({"amount": {"qty": 500, "unit": "g"}, "item": "plain flour"}),
            ),
            (
                "1/2 tsp salt",
                json!({"amount": {"qty": 0.5, "unit": "tsp"}, "item": "salt"}),
            ),
            (
                "1 1/2 cups milk",
                json!({"amount": {"qty": 1.5, "unit": "cup"}, "item": "milk"}),
            ),
            (
                "¼ tsp ground nutmeg",
                json!({"amount": {"qty": 0.25, "unit": "tsp"}, "item": "ground nutmeg"}),
            ),
            (
                "2 tablespoons olive oil",
                json!({"amount": {"qty": 2, "unit": "tbsp"}, "item": "olive oil"}),
            ),
            (
                "250 grams butter, softened",
                json!({"amount": {"qty": 250, "unit": "g"}, "item": "butter", "note": "softened"}),
            ),
            (
                "1.5 kg potatoes, peeled",
                json!({"amount": {"qty": 1.5, "unit": "kg"}, "item": "potatoes", "note": "peeled"}),
            ),
            (
                "a pinch of salt",
                json!({"amount": {"qty": 1, "unit": "pinch"}, "item": "salt"}),
            ),
            (
                "2 pinches of chilli flakes",
                json!({"amount": {"qty": 2, "unit": "pinch"}, "item": "chilli flakes"}),
            ),
            (
                "Salt and pepper, to taste",
                json!({"item": "salt and pepper", "scale": "toTaste"}),
            ),
            (
                "3\u{2013}4 sprigs thyme",
                json!({"amount": {"qty": {"min": 3, "max": 4}}, "item": "sprigs thyme", "scale": "discrete"}),
            ),
            (
                "1 to 2 tsp honey",
                json!({"amount": {"qty": {"min": 1, "max": 2}, "unit": "tsp"}, "item": "honey"}),
            ),
            (
                "1 onion, finely chopped (optional)",
                json!({"amount": {"qty": 1}, "item": "onion", "note": "finely chopped", "optional": true, "scale": "discrete"}),
            ),
            (
                "200 ml double cream",
                json!({"amount": {"qty": 200, "unit": "ml"}, "item": "double cream"}),
            ),
            (
                "1 litre vegetable stock",
                json!({"amount": {"qty": 1, "unit": "l"}, "item": "vegetable stock"}),
            ),
            (
                "8 oz (225 g) cream cheese",
                json!({"amount": {"qty": 8, "unit": "oz"}, "alt": {"qty": 225, "unit": "g"}, "item": "cream cheese"}),
            ),
            (
                "2 lbs chicken thighs",
                json!({"amount": {"qty": 2, "unit": "lb"}, "item": "chicken thighs"}),
            ),
            (
                "1 large egg yolk",
                json!({"amount": {"qty": 1}, "item": "large egg yolk", "scale": "discrete"}),
            ),
            (
                "Juice of 2 lemons",
                json!({"prefix": "Juice of", "amount": {"qty": 2}, "item": "lemons", "scale": "discrete"}),
            ),
            (
                "Olive oil, for frying",
                json!({"item": "olive oil", "note": "for frying"}),
            ),
            (
                "- 3 tbsp sugar",
                json!({"amount": {"qty": 3, "unit": "tbsp"}, "item": "sugar"}),
            ),
            (
                "10 fl oz milk",
                json!({"amount": {"qty": 10, "unit": "floz"}, "item": "milk"}),
            ),
            (
                "2 cups of flour",
                json!({"amount": {"qty": 2, "unit": "cup"}, "item": "flour"}),
            ),
            (
                "  400g   tinned   tomatoes ",
                json!({"amount": {"qty": 400, "unit": "g"}, "item": "tinned tomatoes"}),
            ),
            (
                "1 tsp salt, to taste",
                json!({"amount": {"qty": 1, "unit": "tsp"}, "item": "salt", "scale": "toTaste"}),
            ),
            (
                "Parmesan (optional)",
                json!({"item": "parmesan", "optional": true}),
            ),
        ];
        for (line, expected) in cases {
            let want: Ingredient = serde_json::from_value(expected).unwrap();
            assert_eq!(parse_ingredient_line(line), Ok(want), "{line}");
        }
    }

    #[test]
    fn rejects_lines_without_a_name() {
        assert_eq!(
            parse_ingredient_line("  "),
            Err(IngredientParseError::Empty)
        );
        assert_eq!(parse_ingredient_line("-"), Err(IngredientParseError::Empty));
        assert!(matches!(
            parse_ingredient_line("600 g"),
            Err(IngredientParseError::MissingItem(_))
        ));
    }
}
