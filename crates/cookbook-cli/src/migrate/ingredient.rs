use cookbook_core::{Amount, Ingredient, Qty, QtyRange, ScaleMode, Unit};
use scraper::{ElementRef, Node, Selector};

/// Stands in for each quantity span while a legacy line is flattened to text.
pub const MARK: char = '\u{E000}';

pub fn normalise(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Flattens an element to text, replacing every `data-base` span with [`MARK`] and
/// collecting those spans in order.
pub fn flatten<'a>(element: ElementRef<'a>, spans: &mut Vec<ElementRef<'a>>) -> String {
    let mut out = String::new();
    for child in element.children() {
        match child.value() {
            Node::Text(text) => out.push_str(text),
            Node::Element(_) => {
                let Some(inner) = ElementRef::wrap(child) else {
                    continue;
                };
                if inner.value().attr("data-base").is_some() {
                    spans.push(inner);
                    out.push(MARK);
                } else {
                    out.push_str(&flatten(inner, spans));
                }
            }
            _ => {}
        }
    }
    out
}

pub fn plain_text(element: ElementRef) -> String {
    normalise(&flatten(element, &mut Vec::new()))
}

pub enum Line {
    Heading(String),
    Item(Box<Ingredient>),
}

fn leading_number(text: &str) -> Option<(f64, &str)> {
    if let Some(rest) = text.strip_prefix('½') {
        return Some((0.5, rest));
    }
    let end = text
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(text.len());
    Some((text.get(..end)?.parse().ok()?, &text[end..]))
}

fn unit_of(name: &str) -> Option<Unit> {
    Some(match name {
        "g" => Unit::G,
        "kg" => Unit::Kg,
        "ml" => Unit::Ml,
        "L" | "l" => Unit::L,
        "tsp" => Unit::Tsp,
        "tbsp" => Unit::Tbsp,
        "cup" => Unit::Cup,
        "oz" => Unit::Oz,
        "lb" => Unit::Lb,
        "floz" => Unit::Floz,
        _ => return None,
    })
}

/// A range shown as text ("6-7", "100-150g").
fn displayed_range(text: &str) -> Option<(f64, f64)> {
    let (min, rest) = leading_number(text)?;
    let rest = rest.trim_start().strip_prefix(['-', '\u{2013}'])?;
    let (max, _) = leading_number(rest.trim_start())?;
    (min < max).then_some((min, max))
}

/// Builds an amount from a quantity span. A range shown in the text wins over the
/// midpoint stored in `data-base`.
pub fn amount_of(span: ElementRef) -> Result<Amount, String> {
    let text = normalise(&span.text().collect::<String>());
    let base: f64 = span
        .value()
        .attr("data-base")
        .and_then(|b| b.parse().ok())
        .ok_or_else(|| format!("'{text}' has no usable data-base"))?;
    let unit = span
        .value()
        .attr("data-original-unit")
        .or_else(|| span.value().attr("data-unit"))
        .map(|u| unit_of(u).ok_or_else(|| format!("unknown unit '{u}'")))
        .transpose()?;
    let qty = if let Some((min, max)) = displayed_range(&text) {
        if ((min + max) / 2.0 - base).abs() > 1e-9 {
            return Err(format!("'{text}' does not match data-base {base}"));
        }
        Qty::Range(QtyRange { min, max })
    } else {
        let shown = leading_number(&text).map(|(n, _)| n);
        if shown != Some(base) {
            return Err(format!("'{text}' does not match data-base {base}"));
        }
        Qty::Single(base)
    };
    Ok(Amount { qty, unit })
}

/// An author-given equivalent written as text, e.g. "(6oz)" or "(1.5kg)".
fn text_alt(rest: &str) -> Option<(Amount, &str)> {
    let inner = rest.strip_prefix('(')?;
    let close = inner.find(')')?;
    let (number, unit) = leading_number(&inner[..close])?;
    let unit = unit_of(unit)?;
    Some((
        Amount {
            qty: Qty::Single(number),
            unit: Some(unit),
        },
        inner[close + 1..].trim_start(),
    ))
}

/// A quantity written as plain text at the start of a line without a span.
fn plain_amount(line: &str) -> Option<(Amount, &str)> {
    let (number, rest) = leading_number(line)?;
    let word = rest.split_whitespace().next();
    let unit = word.and_then(unit_of);
    let remainder = match unit {
        Some(_) => rest.trim_start().split_once(char::is_whitespace)?.1,
        None if rest.starts_with(char::is_whitespace) => rest,
        None => return None,
    };
    Some((
        Amount {
            qty: Qty::Single(number),
            unit,
        },
        remainder.trim_start(),
    ))
}

struct Split {
    item: String,
    note: Option<String>,
    optional: bool,
}

fn inner_of_first_paren(text: &str) -> Option<(&str, &str)> {
    let open = text.find('(')?;
    let close = text[open..].find(')')? + open;
    Some((&text[open + 1..close], &text[close + 1..]))
}

fn split_item(text: &str) -> Split {
    let text = text.trim();
    if let Some(rest) = text.strip_prefix("Optional:") {
        return Split {
            item: rest.trim().to_owned(),
            note: None,
            optional: true,
        };
    }
    let mut notes: Vec<String> = Vec::new();
    let mut text = text;
    if text.starts_with('(')
        && let Some((inner, after)) = inner_of_first_paren(text)
    {
        notes.push(inner.to_owned());
        text = after.trim_start();
    }
    let item = if text.matches('(').count() > 1 {
        text
    } else if let Some(cut) = text.find([',', '(']) {
        let (item, tail) = text.split_at(cut);
        if let Some(rest) = tail.strip_prefix(',') {
            notes.push(rest.trim().to_owned());
        } else if let Some((inner, after)) = inner_of_first_paren(tail) {
            notes.push(inner.to_owned());
            let after = after.trim_start().trim_start_matches(',').trim();
            if !after.is_empty() {
                notes.push(after.to_owned());
            }
        }
        item.trim_end()
    } else {
        text
    };
    let mut note = notes.join(", ");
    let mut optional = false;
    if note == "optional" {
        note.clear();
        optional = true;
    } else if let Some(rest) = note.strip_prefix("optional, ") {
        note = rest.to_owned();
        optional = true;
    } else if let Some(rest) = note.strip_suffix(" (optional)") {
        note = rest.to_owned();
        optional = true;
    }
    Split {
        item: item.to_owned(),
        note: (!note.is_empty()).then_some(note),
        optional,
    }
}

fn food_for(item: &str) -> Option<&'static str> {
    Some(match item.to_lowercase().as_str() {
        "plain flour" => "flour-plain",
        "sugar" => "sugar",
        "caster sugar" => "sugar-caster",
        "butter" | "melted butter" => "butter",
        "milk" => "milk",
        "extra virgin olive oil" | "olive oil" => "olive-oil",
        "eggs" => "egg",
        "heavy cream" | "cream" => "cream",
        "honey" => "honey",
        _ => return None,
    })
}

/// Finishes an ingredient from the text left once any quantity has been taken off.
pub fn build(
    amount: Option<Amount>,
    alt: Option<Amount>,
    prefix: Option<String>,
    rest: &str,
) -> Ingredient {
    let split = split_item(rest);
    let whole_pieces = amount.as_ref().is_some_and(|a| {
        a.unit.is_none() && a.qty.min().fract() == 0.0 && a.qty.max().fract() == 0.0
    });
    let scale = if whole_pieces {
        Some(ScaleMode::Discrete)
    } else if amount.is_none() && split.item.to_lowercase().contains("to taste") {
        Some(ScaleMode::ToTaste)
    } else {
        None
    };
    Ingredient {
        food: food_for(&split.item).map(str::to_owned),
        amount,
        alt,
        prefix,
        item: Some(split.item),
        note: split.note,
        optional: split.optional,
        scale,
        ..Ingredient::default()
    }
}

/// Reads one legacy `<li>` from an ingredient list.
pub fn parse_line(li: ElementRef) -> Result<Line, String> {
    let strong = Selector::parse("strong").map_err(|e| e.to_string())?;
    let mut spans = Vec::new();
    let text = normalise(&flatten(li, &mut spans));
    if let Some(heading) = li.select(&strong).next()
        && plain_text(heading) == text
    {
        return Ok(Line::Heading(text.trim_end_matches(':').trim().to_owned()));
    }
    let Some(first) = spans.first() else {
        let (amount, rest) = match plain_amount(&text) {
            Some((amount, rest)) => (Some(amount), rest),
            None => (None, text.as_str()),
        };
        return Ok(Line::Item(Box::new(build(amount, None, None, rest))));
    };
    let (before, after) = text
        .split_once(MARK)
        .ok_or_else(|| format!("no marker in '{text}'"))?;
    let prefix = (!before.trim().is_empty()).then(|| before.trim().to_owned());
    let amount = amount_of(*first)?;
    let after = after.trim_start();
    let marked_alt = format!("({MARK})");
    let (alt, rest) = if let Some(rest) = after.strip_prefix(&marked_alt) {
        let second = spans.get(1).ok_or("a bracketed amount has no span")?;
        (Some(amount_of(*second)?), rest.trim_start())
    } else if let Some((alt, rest)) = text_alt(after) {
        (Some(alt), rest)
    } else {
        (None, after)
    };
    if rest.contains(MARK) {
        return Err(format!("unexpected extra amount in '{text}'"));
    }
    Ok(Line::Item(Box::new(build(Some(amount), alt, prefix, rest))))
}

/// Reads a group heading such as "Cheese (1150g total):" or "Accompaniments:".
pub fn parse_heading(p: ElementRef) -> Result<(String, Option<Amount>), String> {
    let mut spans = Vec::new();
    let text = normalise(&flatten(p, &mut spans));
    match spans.first() {
        Some(span) => {
            let name = text
                .split_once('(')
                .map_or(text.as_str(), |(name, _)| name)
                .trim();
            Ok((name.to_owned(), Some(amount_of(*span)?)))
        }
        None => Ok((text.trim_end_matches(':').trim().to_owned(), None)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_notes_and_optional_flags() {
        let s = split_item("garlic (2 cloves), minced");
        assert_eq!(
            (s.item.as_str(), s.note.as_deref()),
            ("garlic", Some("2 cloves, minced"))
        );
        let s = split_item("apple, finely sliced (optional)");
        assert!(s.optional && s.note.as_deref() == Some("finely sliced"));
        let s = split_item("(one 28oz tin) crushed tomatoes");
        assert_eq!(
            (s.item.as_str(), s.note.as_deref()),
            ("crushed tomatoes", Some("one 28oz tin"))
        );
        let s = split_item("Mix of hard (Parmesan), soft (Brie), blue");
        assert!(s.note.is_none() && s.item.starts_with("Mix of hard"));
    }

    #[test]
    fn reads_ranges_and_plain_amounts() {
        assert_eq!(displayed_range("100-150g"), Some((100.0, 150.0)));
        assert_eq!(displayed_range("½"), None);
        let (amount, rest) = plain_amount("300g ribeye steak").unwrap();
        assert_eq!((amount.unit, rest), (Some(Unit::G), "ribeye steak"));
        let (amount, rest) = plain_amount("2 garlic cloves (optional)").unwrap();
        assert_eq!((amount.unit, rest), (None, "garlic cloves (optional)"));
        assert!(plain_amount("Salt").is_none());
    }
}
