//! Mends the slips a small model makes that the checklist cannot see, by comparing the import with
//! the pasted text: dropped amounts are put back (read with the editor's own ingredient parser),
//! tokens that repeat no amount become plain words, sizes taken for temperatures go back, times come
//! only from the source's own labels, and tips must come from the source. Nothing is added that the
//! source does not write.

use cookbook_core::{
    CheckResult, Ingredient, Level, Qty, Recipe, ScaleMode, Times, Unit, parse_ingredient_line,
};

/// Words that describe rather than name, left out when matching an ingredient to a source line.
const DESCRIPTIVE: &[&str] = &[
    "a", "an", "and", "the", "of", "fresh", "cold", "warm", "melted", "chopped", "finely",
    "sliced", "grated", "large", "small", "ripe", "dried", "ground", "beaten", "soft", "softened",
];

/// The American names the house rules turn into British ones, so a renamed ingredient still
/// matches its line in the source.
const RENAMES: &[(&str, &str)] = &[
    ("all-purpose flour", "plain flour"),
    ("all purpose flour", "plain flour"),
    ("baking soda", "bicarbonate of soda"),
    ("powdered sugar", "icing sugar"),
    ("confectioners' sugar", "icing sugar"),
    ("superfine sugar", "caster sugar"),
    ("heavy cream", "double cream"),
    ("cilantro", "coriander"),
    ("zucchini", "courgette"),
    ("eggplant", "aubergine"),
    ("scallions", "spring onions"),
    ("ground beef", "beef mince"),
];

fn words(text: &str) -> Vec<String> {
    let mut text = text.to_lowercase();
    for (american, british) in RENAMES {
        text = text.replace(american, british);
    }
    text.split(|c: char| !c.is_alphabetic())
        .filter(|word| !word.is_empty())
        .map(|word| {
            let word = word.to_owned();
            match word.strip_suffix('s') {
                Some(stem) if stem.len() > 2 && !stem.ends_with('s') => stem.to_owned(),
                _ => word,
            }
        })
        .filter(|word| !DESCRIPTIVE.contains(&word.as_str()))
        .collect()
}

/// The pieces of the source that may each be one ingredient line: every line, the parts of a line
/// after a part's name ("Pastry: 200g flour, 100g butter") and between commas, and the sides of an
/// "and" when each side starts with a number ("1 carrot and 1 celery stick").
fn pieces(source: &str) -> Vec<String> {
    let mut pieces = Vec::new();
    for line in source
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        pieces.push(line.to_owned());
        let body = match line.split_once(':') {
            Some((head, rest))
                if head.split_whitespace().count() <= 3 && !rest.trim().is_empty() =>
            {
                rest
            }
            _ => line,
        };
        for part in body.split([',', ';']).map(str::trim) {
            let sides: Vec<&str> = part.split(" and ").map(str::trim).collect();
            let numbered = |side: &&str| side.starts_with(|c: char| c.is_ascii_digit());
            if sides.len() > 1 && sides.iter().all(numbered) {
                pieces.extend(sides.iter().map(|side| (*side).to_owned()));
            } else if !part.is_empty() {
                pieces.push(part.to_owned());
            }
        }
    }
    pieces
}

/// The parsed source lines that name `item`: those whose name is exactly the item's, or failing
/// that, those whose name has every naming word of the item ("eggs" is "4 eggs" before "1 egg yolk").
fn matches<'a>(item: &str, parsed: &'a [Ingredient]) -> Vec<&'a Ingredient> {
    let wanted = words(item);
    if wanted.is_empty() {
        return Vec::new();
    }
    let named = |line: &&Ingredient| words(line.item.as_deref().unwrap_or_default());
    let exact: Vec<&Ingredient> = parsed
        .iter()
        .filter(|line| {
            let mut have = named(line);
            let mut want = wanted.clone();
            have.sort();
            want.sort();
            have == want
        })
        .collect();
    if !exact.is_empty() {
        return exact;
    }
    parsed
        .iter()
        .filter(|line| {
            let have = named(line);
            wanted.iter().all(|word| have.contains(word))
        })
        .collect()
}

/// Restores dropped amounts in place and returns a warning for each, so the cook checks it.
pub fn restore_amounts(recipe: &mut Recipe, source: &str) -> Vec<CheckResult> {
    let parsed: Vec<Ingredient> = pieces(source)
        .iter()
        .filter_map(|piece| parse_ingredient_line(piece).ok())
        .filter(|line| line.amount.is_some())
        .collect();
    let mut restored = Vec::new();
    for (g, group) in recipe.ingredient_groups.iter_mut().enumerate() {
        for (i, ingredient) in group.items.iter_mut().enumerate() {
            if ingredient.amount.is_some() || ingredient.scale == Some(ScaleMode::ToTaste) {
                continue;
            }
            let Some(item) = ingredient.item.as_deref() else {
                continue;
            };
            let found = matches(item, &parsed);
            let Some(first) = found.first().and_then(|line| line.amount.clone()) else {
                continue;
            };
            // Two different amounts for the same name (flour for the base and for the sauce) are
            // left for the cook rather than guessed between.
            if found
                .iter()
                .any(|line| line.amount.as_ref() != Some(&first))
            {
                continue;
            }
            ingredient.amount = Some(first);
            restored.push(CheckResult {
                id: "W-IMPORT-AMOUNT",
                level: Level::Warning,
                message: format!(
                    "the amount for {item} was taken from the pasted text; check that it is right"
                ),
                path: format!("ingredientGroups[{g}].items[{i}].amount"),
                recipe: String::new(),
            });
        }
    }
    restored
}

/// Every mend at once; returns a warning for each restored amount, for the cook to check.
pub fn mend(recipe: &mut Recipe, source: &str) -> Vec<CheckResult> {
    let restored = restore_amounts(recipe, source);
    plain_unrepeated_tokens(recipe, source);
    unwrap_sizes(recipe);
    times_from_source(recipe, source);
    keep_source_tips(recipe, source);
    note_averaged_ranges(recipe, source);
    check_scaling(recipe, source);
    drop_repeated_lines(recipe);
    restored
}

/// Words that name salt, pepper, spices and herbs: the only lines `seasoning` scaling suits.
const SEASONINGS: &[&str] = &[
    "salt",
    "pepper",
    "peppercorn",
    "nutmeg",
    "paprika",
    "cumin",
    "cinnamon",
    "chilli",
    "chili",
    "cayenne",
    "oregano",
    "thyme",
    "rosemary",
    "basil",
    "parsley",
    "coriander",
    "spice",
    "turmeric",
    "ginger",
    "garam",
    "masala",
    "curry",
    "allspice",
    "saffron",
    "fennel",
    "seed",
    "sage",
    "dill",
    "mint",
    "bay",
    "herb",
    "clove",
    "mustard",
    "vanilla",
    "bicarbonate",
    "baking",
    "yeast",
];

/// `seasoning` grows an amount gently and `fixed` not at all, which ruins a main ingredient when a
/// small model applies them to butter or flour; such a line goes back to scaling with the servings.
fn check_scaling(recipe: &mut Recipe, source: &str) {
    let per = source.to_lowercase().contains("per ");
    for item in recipe
        .ingredient_groups
        .iter_mut()
        .flat_map(|g| g.items.iter_mut())
    {
        let name = words(item.item.as_deref().unwrap_or_default());
        let garlic = name.iter().any(|w| w == "garlic");
        match item.scale {
            Some(ScaleMode::Seasoning)
                if garlic || !name.iter().any(|w| SEASONINGS.contains(&w.as_str())) =>
            {
                item.scale = None;
            }
            Some(ScaleMode::Fixed) if !per && !name.iter().any(|w| w == "bay") => item.scale = None,
            Some(ScaleMode::Linear) => item.scale = None,
            _ => {}
        }
    }
}

/// The same ingredient twice in a part is a slip: the same name, with the same amount give or take
/// rounding ("0.33 cup" and "0.333 cup"), or with no amount on one of them. The later copy goes.
fn drop_repeated_lines(recipe: &mut Recipe) {
    let qty = |item: &Ingredient| {
        item.amount.as_ref().map(|amount| match amount.qty {
            Qty::Single(n) => n,
            Qty::Range(range) => range.min,
        })
    };
    let same = |a: &Ingredient, b: &Ingredient| {
        a.item.as_deref().map(str::to_lowercase) == b.item.as_deref().map(str::to_lowercase)
            && match (qty(a), qty(b)) {
                (Some(x), Some(y)) => {
                    (x - y).abs() <= x.abs().max(y.abs()) * 0.02
                        && a.amount.as_ref().map(|m| m.unit) == b.amount.as_ref().map(|m| m.unit)
                }
                _ => true,
            }
    };
    for group in &mut recipe.ingredient_groups {
        let mut kept: Vec<Ingredient> = Vec::new();
        for item in group.items.drain(..) {
            match kept.iter_mut().find(|other| same(other, &item)) {
                // Keep the copy that has an amount.
                Some(other) if other.amount.is_none() && item.amount.is_some() => *other = item,
                Some(_) => {}
                None => kept.push(item),
            }
        }
        group.items = kept;
    }
}

/// Words a parsed piece of the method may name that are not ingredients.
const NOT_INGREDIENTS: &[&str] = &[
    "minute", "min", "hour", "hr", "second", "degree", "cm", "mm", "inch", "time", "serve",
    "serving", "slice", "portion", "kcal", "calorie", "people", "person", "loaf", "step", "day",
];

/// Ingredients the source writes with an amount that the import has no line for, in the source's
/// words, for the repair round. Only lines short enough to be an ingredient are read.
pub fn missing_ingredients(recipe: &Recipe, source: &str) -> Vec<String> {
    let imported: Vec<Vec<String>> = recipe
        .ingredient_groups
        .iter()
        .flat_map(|g| g.items.iter())
        .map(|item| words(item.item.as_deref().unwrap_or_default()))
        .collect();
    let mut missing = Vec::new();
    for piece in pieces(source).into_iter().filter(|piece| piece.len() <= 60) {
        let Ok(line) = parse_ingredient_line(&piece) else {
            continue;
        };
        if line.amount.is_none() {
            continue;
        }
        let name = words(line.item.as_deref().unwrap_or_default());
        if name.is_empty() || name.iter().any(|w| NOT_INGREDIENTS.contains(&w.as_str())) {
            continue;
        }
        // Found when any imported line shares the source line's main word (its last one).
        let head = name.last().cloned().unwrap_or_default();
        let found = imported
            .iter()
            .any(|item| item.contains(&head) || name.iter().all(|w| item.contains(w)));
        if !found && !missing.contains(&piece) {
            missing.push(piece);
        }
    }
    missing
}

fn number_text(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{n:.0}")
    } else {
        format!("{n}")
    }
}

/// The ways a unit is written after a number in a recipe.
fn unit_words(unit: Unit) -> &'static [&'static str] {
    match unit {
        Unit::G => &["g", "gram"],
        Unit::Kg => &["kg", "kilo"],
        Unit::Ml => &["ml", "millilit"],
        Unit::L => &["l", "litre", "liter"],
        Unit::Tsp => &["tsp", "teaspoon"],
        Unit::Tbsp => &["tbsp", "tablespoon"],
        Unit::Cup => &["cup"],
        Unit::Oz => &["oz", "ounce"],
        Unit::Lb => &["lb", "pound"],
        Unit::Floz => &["fl oz", "fluid"],
        Unit::Pinch => &["pinch"],
    }
}

/// How often the amount is written in the source: the number followed by its unit ("1 tbsp",
/// "30g"), or for a count, by the ingredient's first word ("2 garlic").
fn amount_written(source: &str, qty: f64, follower: &[String]) -> usize {
    let lower = source.to_lowercase();
    let number = number_text(qty);
    let bytes = lower.as_bytes();
    lower
        .match_indices(&number)
        .filter(|(at, _)| {
            let before = at.checked_sub(1).map(|b| bytes[b]);
            if before.is_some_and(|b| b.is_ascii_digit() || b == b'.') {
                return false;
            }
            let after = lower[at + number.len()..].trim_start();
            !after.starts_with(|c: char| c.is_ascii_digit())
                && follower.iter().any(|word| after.starts_with(word.as_str()))
        })
        .count()
}

/// A `{@key}` shows the amount in the step, so it belongs only where the method repeats it: the
/// amount is written in the source more than once, in the list and again in a step. Elsewhere it
/// becomes the ingredient's name, and a key nothing refers to any more is dropped.
fn plain_unrepeated_tokens(recipe: &mut Recipe, source: &str) {
    let ingredients: Vec<(String, String, bool)> = recipe
        .ingredient_groups
        .iter()
        .flat_map(|group| group.items.iter())
        .filter_map(|item| {
            let key = item.key.clone()?;
            let name = item.item.clone().unwrap_or_else(|| key.clone());
            let repeated = item.amount.as_ref().is_some_and(|amount| {
                let follower: Vec<String> = match amount.unit {
                    Some(unit) => unit_words(unit).iter().map(|w| (*w).to_owned()).collect(),
                    None => words(&name).into_iter().take(1).collect(),
                };
                let qty = match amount.qty {
                    Qty::Single(n) => n,
                    Qty::Range(range) => range.min,
                };
                amount_written(source, qty, &follower) >= 2
            });
            Some((key, name, repeated))
        })
        .collect();
    for step in &mut recipe.steps {
        for (key, name, repeated) in &ingredients {
            if *repeated {
                continue;
            }
            let token = format!("{{@{key}}}");
            let plain = format!("the {name}");
            step.text = step
                .text
                .replace(&format!("the {token}"), &plain)
                .replace(&format!("The {token}"), &format!("The {name}"))
                .replace(&token, &plain);
        }
    }
    let used: Vec<String> = recipe.steps.iter().map(|step| step.text.clone()).collect();
    for item in recipe
        .ingredient_groups
        .iter_mut()
        .flat_map(|g| g.items.iter_mut())
    {
        if let Some(key) = &item.key
            && !used.iter().any(|text| text.contains(&format!("{{@{key}")))
        {
            item.key = None;
        }
    }
}

/// "23cm tin" is a size, not a temperature: a `{temp:...}` straight before a length goes back to
/// the plain number.
fn unwrap_sizes(recipe: &mut Recipe) {
    for step in &mut recipe.steps {
        let mut text = String::new();
        let mut rest = step.text.as_str();
        while let Some(at) = rest.find("{temp:") {
            let Some(end) = rest[at..].find('}').map(|end| at + end) else {
                break;
            };
            let after = rest[end + 1..].trim_start().to_lowercase();
            let size = ["cm", "mm", "inch", "in ", "in.", "x "]
                .iter()
                .any(|unit| after.starts_with(unit));
            text.push_str(&rest[..at]);
            if size {
                text.push_str(rest[at + 6..end].trim_end_matches('!'));
            } else {
                text.push_str(&rest[at..=end]);
            }
            rest = &rest[end + 1..];
        }
        text.push_str(rest);
        step.text = text;
    }
}

/// Minutes in a label such as "Prep: 15 mins", "Cook time: 1 hour" or "Resting: 1 hr 30 min".
fn labelled_minutes(line: &str, label: &str) -> Option<u32> {
    let lower = line.to_lowercase();
    let at = lower.find(label)?;
    let after = &lower[at + label.len()..];
    let after =
        after.trim_start_matches(|c: char| c.is_alphabetic() || c == ' ' || c == ':' || c == '-');
    let mut total = 0.0;
    let mut found = false;
    let mut number = String::new();
    let mut chars = after.chars().peekable();
    while let Some(c) = chars.next() {
        if c.is_ascii_digit() || c == '.' {
            number.push(c);
            continue;
        }
        if number.is_empty() {
            if c == ' ' {
                continue;
            }
            break;
        }
        let rest: String = std::iter::once(c).chain(chars.clone()).collect::<String>();
        let rest = rest.trim_start();
        let value: f64 = number.parse().unwrap_or(0.0);
        number.clear();
        if rest.starts_with('h') {
            total += value * 60.0;
            found = true;
        } else if rest.starts_with('m') {
            total += value;
            found = true;
        } else {
            break;
        }
        while chars.peek().is_some_and(|c| c.is_alphabetic() || *c == ' ') {
            chars.next();
        }
    }
    (found && total > 0.0).then(|| total.round() as u32)
}

/// Times come only from the source's own labels ("Prep: 15 mins"), never from the method.
fn times_from_source(recipe: &mut Recipe, source: &str) {
    let find = |labels: &[&str]| {
        source.lines().find_map(|line| {
            labels
                .iter()
                .find_map(|label| labelled_minutes(line, label))
        })
    };
    let times = Times {
        prep: find(&["prep"]),
        cook: find(&[
            "cook time",
            "cooking time",
            "cook:",
            "bake time",
            "baking time",
        ]),
        rest: find(&[
            "rest time",
            "resting time",
            "resting:",
            "rest:",
            "chill time",
        ]),
    };
    recipe.times =
        (times.prep.is_some() || times.cook.is_some() || times.rest.is_some()).then_some(times);
}

/// A tip must come from the source: most of its words have to appear in the pasted text.
fn keep_source_tips(recipe: &mut Recipe, source: &str) {
    let have = words(source);
    recipe.tips.retain(|tip| {
        let tip_words: Vec<String> = words(tip).into_iter().filter(|w| w.len() > 3).collect();
        if tip_words.is_empty() {
            return true;
        }
        let found = tip_words.iter().filter(|w| have.contains(w)).count();
        found * 10 >= tip_words.len() * 6
    });
}

/// A weight or volume range in the source becomes its middle; the tip saying so is written here,
/// not by the model, so it appears exactly when it is true.
fn note_averaged_ranges(recipe: &mut Recipe, source: &str) {
    let parsed: Vec<Ingredient> = pieces(source)
        .iter()
        .filter_map(|piece| parse_ingredient_line(piece).ok())
        .collect();
    let mut notes = Vec::new();
    for item in recipe.ingredient_groups.iter().flat_map(|g| g.items.iter()) {
        let (Some(amount), Some(name)) = (&item.amount, item.item.as_deref()) else {
            continue;
        };
        let Qty::Single(qty) = amount.qty else {
            continue;
        };
        let measured = !matches!(amount.unit, None | Some(Unit::Pinch));
        let averaged = matches(name, &parsed).iter().any(|line| {
            matches!(&line.amount, Some(a) if matches!(a.qty, Qty::Range(r) if ((r.min + r.max) / 2.0 - qty).abs() < 0.01))
        });
        if measured && averaged {
            notes.push(format!(
                "The amount of {name} is a guide: the recipe gave a range, so use more or less to taste."
            ));
        }
    }
    for note in notes {
        if !recipe.tips.contains(&note) {
            recipe.tips.push(note);
        }
    }
}

#[cfg(test)]
mod tests {
    use cookbook_core::{Amount, Qty, Unit, parse_recipe};

    use super::*;

    fn recipe(items: &str) -> Recipe {
        parse_recipe(&format!(
            r#"{{"title":"T","summary":"s","servings":4,
            "ingredientGroups":[{{"items":[{items}]}}],"steps":[{{"text":"Mix."}}]}}"#
        ))
        .unwrap()
    }

    fn amount(recipe: &Recipe, i: usize) -> Option<Amount> {
        recipe.ingredient_groups[0].items[i].amount.clone()
    }

    #[test]
    fn a_dropped_amount_is_put_back_from_its_line() {
        let mut r = recipe(r#"{"item":"butter","food":"butter","note":"melted"},{"item":"sugar"}"#);
        let notes = restore_amounts(&mut r, "1/3 cup melted butter\n1/2 cup sugar");
        assert_eq!(
            amount(&r, 0),
            Some(Amount {
                qty: Qty::Single(1.0 / 3.0),
                unit: Some(Unit::Cup)
            })
        );
        assert_eq!(amount(&r, 1).map(|a| a.qty), Some(Qty::Single(0.5)));
        assert_eq!(notes.len(), 2);
        assert!(
            notes
                .iter()
                .all(|n| n.id == "W-IMPORT-AMOUNT" && n.level == Level::Warning)
        );
    }

    #[test]
    fn amounts_inside_a_line_after_a_part_name_are_found() {
        let mut r =
            recipe(r#"{"item":"plain flour"},{"item":"butter","note":"cold"},{"item":"egg yolk"}"#);
        restore_amounts(
            &mut r,
            "Pastry: 200g plain flour, 100g cold butter, 50g icing sugar, 1 egg yolk",
        );
        assert_eq!(
            amount(&r, 0).map(|a| (a.qty, a.unit)),
            Some((Qty::Single(200.0), Some(Unit::G)))
        );
        assert_eq!(
            amount(&r, 1).map(|a| (a.qty, a.unit)),
            Some((Qty::Single(100.0), Some(Unit::G)))
        );
        assert_eq!(amount(&r, 2).map(|a| a.qty), Some(Qty::Single(1.0)));
    }

    #[test]
    fn each_side_of_an_and_is_its_own_line_when_both_have_numbers() {
        let mut r = recipe(r#"{"item":"carrot"},{"item":"celery stick"}"#);
        restore_amounts(
            &mut r,
            "1 onion, 1 carrot and 1 celery stick, finely chopped",
        );
        assert_eq!(amount(&r, 0).map(|a| a.qty), Some(Qty::Single(1.0)));
        assert_eq!(amount(&r, 1).map(|a| a.qty), Some(Qty::Single(1.0)));
    }

    #[test]
    fn nothing_is_invented_or_guessed() {
        let mut r = recipe(
            r#"{"item":"salt","scale":"toTaste"},{"item":"olive oil"},{"item":"plain flour"},{"item":"milk","amount":{"qty":300,"unit":"ml"}}"#,
        );
        let notes = restore_amounts(
            &mut r,
            "Salt\nOlive oil for frying\n200g plain flour (base)\n60g plain flour (sauce)\n250ml milk",
        );
        assert_eq!(
            amount(&r, 0),
            None,
            "a to-taste line stays without an amount"
        );
        assert_eq!(
            amount(&r, 1),
            None,
            "a line the source gives no amount stays without one"
        );
        assert_eq!(
            amount(&r, 2),
            None,
            "two different amounts for one name are not guessed between"
        );
        assert_eq!(
            amount(&r, 3).map(|a| a.qty),
            Some(Qty::Single(300.0)),
            "an amount it has is kept"
        );
        assert!(notes.is_empty());
    }

    fn steps(recipe: &Recipe) -> Vec<&str> {
        recipe.steps.iter().map(|step| step.text.as_str()).collect()
    }

    fn with_steps(items: &str, steps: &str) -> Recipe {
        parse_recipe(&format!(
            r#"{{"title":"T","summary":"s","servings":4,
            "ingredientGroups":[{{"items":[{items}]}}],"steps":[{steps}]}}"#
        ))
        .unwrap()
    }

    #[test]
    fn a_token_stays_only_where_the_method_repeats_the_amount() {
        let mut r = with_steps(
            r#"{"key":"oil","item":"olive oil","amount":{"qty":1,"unit":"tbsp"}},{"key":"butter","item":"butter","amount":{"qty":30,"unit":"g"}}"#,
            r#"{"text":"Warm {@oil} in a pan."},{"text":"Add the {@butter} and baste."}"#,
        );
        mend(
            &mut r,
            "1 tbsp olive oil\n30g butter\nWarm 1 tbsp olive oil in a pan.\nAdd the butter and baste.",
        );
        assert_eq!(
            steps(&r),
            ["Warm {@oil} in a pan.", "Add the butter and baste."]
        );
        assert_eq!(r.ingredient_groups[0].items[0].key.as_deref(), Some("oil"));
        assert_eq!(
            r.ingredient_groups[0].items[1].key, None,
            "a key nothing uses is dropped"
        );
    }

    #[test]
    fn a_count_needs_its_name_after_the_number_to_count_as_repeated() {
        let mut r = with_steps(
            r#"{"key":"garlic","item":"garlic cloves","amount":{"qty":2}}"#,
            r#"{"text":"Fry {@garlic} for 1 minute."}"#,
        );
        mend(
            &mut r,
            "2 garlic cloves\n1. Fry the garlic for 1 minute.\n2. Serve.",
        );
        assert_eq!(steps(&r), ["Fry the garlic cloves for 1 minute."]);
    }

    #[test]
    fn a_size_taken_for_a_temperature_goes_back_to_a_number() {
        let mut r = with_steps(
            r#"{"item":"pastry"}"#,
            r#"{"text":"Line a {temp:23}cm tin and bake at {temp:190} for {timer:15}."}"#,
        );
        mend(&mut r, "");
        assert_eq!(
            steps(&r),
            ["Line a 23cm tin and bake at {temp:190} for {timer:15}."]
        );
    }

    #[test]
    fn times_come_from_the_source_labels_and_nowhere_else() {
        let mut r = recipe(r#"{"item":"flour"}"#);
        r.times = Some(Times {
            prep: Some(20),
            cook: None,
            rest: Some(10),
        });
        mend(
            &mut r,
            "Prep Time: 15 minutes | Cook Time: 1 hour 5 mins\nLet it cool for 10 minutes.",
        );
        assert_eq!(
            r.times,
            Some(Times {
                prep: Some(15),
                cook: Some(65),
                rest: None
            })
        );
        let mut none = recipe(r#"{"item":"flour"}"#);
        none.times = Some(Times {
            prep: Some(5),
            cook: None,
            rest: None,
        });
        mend(&mut none, "Mix and bake for 20 minutes.");
        assert_eq!(none.times, None);
    }

    #[test]
    fn a_tip_must_come_from_the_source_and_the_range_tip_is_written_here() {
        let mut r = recipe(r#"{"item":"Parmesan","amount":{"qty":90,"unit":"g"}}"#);
        r.tips = vec![
            "The tomato sauce can be made a day ahead and kept in the fridge.".to_owned(),
            "Use the middle of the simmering time range as a guide.".to_owned(),
        ];
        mend(
            &mut r,
            "80-100g grated Parmesan\nTip: you can make the tomato sauce a day ahead and keep it in the fridge.",
        );
        assert_eq!(
            r.tips,
            [
                "The tomato sauce can be made a day ahead and kept in the fridge.",
                "The amount of Parmesan is a guide: the recipe gave a range, so use more or less to taste."
            ]
        );
    }

    #[test]
    fn a_renamed_ingredient_still_finds_its_amount() {
        let mut r = recipe(r#"{"item":"plain flour"},{"item":"bicarbonate of soda"}"#);
        mend(&mut r, "1 1/2 cups all-purpose flour\n1 tsp baking soda");
        assert_eq!(
            amount(&r, 0).map(|a| (a.qty, a.unit)),
            Some((Qty::Single(1.5), Some(Unit::Cup)))
        );
        assert_eq!(
            amount(&r, 1).map(|a| (a.qty, a.unit)),
            Some((Qty::Single(1.0), Some(Unit::Tsp)))
        );
    }

    #[test]
    fn seasoning_and_fixed_scaling_stay_only_where_they_belong() {
        let mut r = recipe(
            r#"{"item":"butter","scale":"seasoning"},{"item":"ground nutmeg","scale":"seasoning"},{"item":"garlic cloves","scale":"seasoning"},{"item":"plain flour","scale":"fixed"},{"item":"bay leaves","scale":"fixed"},{"item":"milk","scale":"linear"}"#,
        );
        mend(&mut r, "");
        let scales: Vec<_> = r.ingredient_groups[0]
            .items
            .iter()
            .map(|i| i.scale)
            .collect();
        assert_eq!(
            scales,
            [
                None,
                Some(ScaleMode::Seasoning),
                None,
                None,
                Some(ScaleMode::Fixed),
                None
            ]
        );
    }

    #[test]
    fn the_same_line_twice_in_a_part_is_kept_once() {
        let mut r = recipe(
            r#"{"item":"sunflower oil","amount":{"qty":1,"unit":"tbsp"}},{"item":"sunflower oil","amount":{"qty":1,"unit":"tbsp"}},{"item":"butter"}"#,
        );
        mend(&mut r, "");
        assert_eq!(r.ingredient_groups[0].items.len(), 2);
    }

    #[test]
    fn ingredients_left_out_are_listed_in_the_source_words() {
        let r = recipe(r#"{"item":"plain flour","amount":{"qty":200,"unit":"g"}},{"item":"eggs"}"#);
        let missing = missing_ingredients(
            &r,
            "Pastry: 200g plain flour, 100g cold butter, 50g icing sugar\nFilling: 4 eggs\nBake for 15 minutes at 190C.",
        );
        assert_eq!(missing, ["100g cold butter", "50g icing sugar"]);
    }

    #[test]
    fn a_near_copy_or_a_copy_without_an_amount_is_dropped() {
        let mut r = recipe(
            r#"{"item":"butter","amount":{"qty":0.333,"unit":"cup"}},{"item":"butter","amount":{"qty":0.33,"unit":"cup"}},{"item":"sugar"},{"item":"sugar","amount":{"qty":0.5,"unit":"cup"}},{"item":"milk","amount":{"qty":300,"unit":"ml"}},{"item":"milk","amount":{"qty":50,"unit":"ml"}}"#,
        );
        mend(&mut r, "");
        let names: Vec<_> = r.ingredient_groups[0]
            .items
            .iter()
            .map(|i| (i.item.clone().unwrap(), qty_of(i)))
            .collect();
        assert_eq!(
            names,
            [
                ("butter".to_owned(), Some(0.333)),
                ("sugar".to_owned(), Some(0.5)),
                ("milk".to_owned(), Some(300.0)),
                ("milk".to_owned(), Some(50.0))
            ]
        );
    }

    fn qty_of(item: &Ingredient) -> Option<f64> {
        item.amount.as_ref().map(|a| match a.qty {
            Qty::Single(n) => n,
            Qty::Range(r) => r.min,
        })
    }

    #[test]
    fn an_exact_name_wins_over_a_longer_one() {
        let mut r = recipe(r#"{"item":"egg yolk"},{"item":"eggs"}"#);
        mend(
            &mut r,
            "Pastry: 200g plain flour, 1 egg yolk\nFilling: 4 eggs, 150g caster sugar",
        );
        assert_eq!(amount(&r, 0).map(|a| a.qty), Some(Qty::Single(1.0)));
        assert_eq!(amount(&r, 1).map(|a| a.qty), Some(Qty::Single(4.0)));
    }
}
