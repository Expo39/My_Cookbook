use schemars::JsonSchema;
use serde::Serialize;

use crate::{
    schema::Unit,
    units::{UnitSystem, convert, density, nearest_cup, normalise},
};

const EN_DASH: char = '–';

#[derive(Debug, Clone, Copy)]
pub struct DisplayCtx<'a> {
    /// `None` keeps the authored units and only normalises and rounds them.
    pub system: Option<UnitSystem>,
    pub precise: bool,
    pub food: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
pub struct Shown {
    pub text: String,
    pub min: f64,
    pub max: f64,
    pub unit: Option<Unit>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rounded {
    pub qty: f64,
    pub unit: Unit,
    /// False when a cup amount is more than 5% away from the nearest measurable fraction.
    pub exact: bool,
}

fn step(qty: f64, size: f64) -> f64 {
    (qty / size).round() * size
}

fn nearest(qty: f64, grid: &[f64]) -> f64 {
    grid.iter()
        .copied()
        .min_by(|a, b| (a - qty).abs().total_cmp(&(b - qty).abs()))
        .unwrap_or(qty)
}

const PINCH: Rounded = Rounded {
    qty: 1.0,
    unit: Unit::Pinch,
    exact: true,
};

const TSP_GRID: [f64; 8] = [0.125, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5];

/// Applies the display rounding tables once, for a single unit.
pub fn round_amount(qty: f64, unit: Unit, precise: bool) -> Rounded {
    let exact = |qty, unit| Rounded {
        qty,
        unit,
        exact: true,
    };
    match unit {
        Unit::G if qty < 0.5 => PINCH,
        Unit::G if qty < 5.0 => exact(step(qty, 0.5), Unit::G),
        Unit::G if qty < 100.0 => exact(step(qty, if precise { 1.0 } else { 5.0 }), Unit::G),
        Unit::G if qty < 1000.0 => exact(step(qty, if precise { 5.0 } else { 10.0 }), Unit::G),
        Unit::G => exact(step(qty / 1000.0, 0.05), Unit::Kg),
        Unit::Kg | Unit::L => exact(step(qty, 0.05), unit),
        Unit::Ml if qty < 15.0 => round_amount(qty / 5.0, Unit::Tsp, precise),
        Unit::Ml if qty < 250.0 => exact(step(qty, 5.0), Unit::Ml),
        Unit::Ml if qty < 1000.0 => exact(step(qty, if precise { 10.0 } else { 25.0 }), Unit::Ml),
        Unit::Ml => exact(step(qty / 1000.0, 0.05), Unit::L),
        Unit::Tsp if qty < 0.125 => PINCH,
        Unit::Tsp if qty < 2.75 => exact(nearest(qty, &TSP_GRID), Unit::Tsp),
        Unit::Tsp if qty <= 3.25 => exact(1.0, Unit::Tbsp),
        Unit::Tsp => exact(step(qty, 0.5), Unit::Tsp),
        Unit::Tbsp => exact(step(qty, 0.5).max(0.5), Unit::Tbsp),
        Unit::Cup => {
            let snapped = nearest_cup(qty);
            Rounded {
                qty: snapped,
                unit,
                exact: snapped > 0.0 && (snapped - qty).abs() / qty <= 0.05,
            }
        }
        Unit::Oz if qty < 4.0 => exact(step(qty, 0.25).max(0.25), Unit::Oz),
        Unit::Oz => exact(step(qty, 0.5), Unit::Oz),
        Unit::Lb => exact(step(qty, 0.25).max(0.25), Unit::Lb),
        Unit::Floz => exact(step(qty, 0.5).max(0.5), Unit::Floz),
        Unit::Pinch => exact(qty.round().max(1.0), Unit::Pinch),
    }
}

/// Counts move in quarters below one and in halves above it.
pub fn round_count(qty: f64) -> f64 {
    if qty < 0.125 {
        0.0
    } else if qty < 1.0 {
        nearest(qty, &[0.25, 0.5, 0.75, 1.0])
    } else {
        step(qty, 0.5)
    }
}

fn localise(qty: f64, unit: Unit, food: Option<&str>, system: UnitSystem) -> (f64, Unit) {
    let dens = food.and_then(density);
    let converted = |to| (convert(qty, unit, to, food).unwrap_or(qty), to);
    match (system, unit) {
        (UnitSystem::Metric, Unit::Oz | Unit::Lb) => converted(Unit::G),
        (UnitSystem::Metric, Unit::Floz) => converted(Unit::Ml),
        (UnitSystem::Metric, Unit::Cup) => match dens {
            Some(d) if !d.liquid => converted(Unit::G),
            _ => converted(Unit::Ml),
        },
        (UnitSystem::Us, Unit::G | Unit::Kg) if dens.is_some() => converted(Unit::Cup),
        (UnitSystem::Us, Unit::G | Unit::Kg) => converted(Unit::Oz),
        (UnitSystem::Us, Unit::Ml | Unit::L) => converted(Unit::Cup),
        _ => (qty, unit),
    }
}

/// Localise, normalise, round once, then normalise again in case rounding crossed a boundary.
fn prepare(qty: f64, unit: Unit, ctx: &DisplayCtx) -> (f64, Unit) {
    let (q, u) = match ctx.system {
        Some(system) => localise(qty, unit, ctx.food, system),
        None => (qty, unit),
    };
    let (q, u) = normalise(q, u);
    let mut rounded = round_amount(q, u, ctx.precise);
    if !rounded.exact && ctx.system.is_some() {
        let (fq, fu) = match convert(q, u, Unit::Oz, ctx.food) {
            Some(oz) => (oz, Unit::Oz),
            None => (convert(q, u, Unit::Ml, None).unwrap_or(q), Unit::Ml),
        };
        let (fq, fu) = normalise(fq, fu);
        rounded = round_amount(fq, fu, ctx.precise);
    }
    normalise(rounded.qty, rounded.unit)
}

/// Rounded, localised text for one amount or range of amounts.
pub fn display_amount(min: f64, max: f64, unit: Option<Unit>, ctx: &DisplayCtx) -> Shown {
    let Some(unit) = unit else {
        let (lo, hi) = (round_count(min), round_count(max));
        let text = if (lo - hi).abs() < 1e-9 {
            format_number(hi, None)
        } else {
            range_number(lo, hi, None)
        };
        return Shown {
            text,
            min: lo,
            max: hi,
            unit: None,
        };
    };
    let (hi, hi_unit) = prepare(max, unit, ctx);
    let single = (min - max).abs() < 1e-12;
    let (lo, lo_unit) = if single {
        (hi, hi_unit)
    } else {
        prepare(min, unit, ctx)
    };
    let text = if lo_unit == hi_unit && (lo - hi).abs() < 1e-9 {
        with_unit(hi, hi_unit)
    } else if lo_unit == hi_unit {
        range_with_unit(lo, hi, hi_unit)
    } else {
        format!(
            "{}{EN_DASH}{}",
            with_unit(lo, lo_unit),
            with_unit(hi, hi_unit)
        )
    };
    Shown {
        text,
        min: lo,
        max: hi,
        unit: Some(hi_unit),
    }
}

fn unit_label(unit: Unit, qty: f64) -> &'static str {
    if unit == Unit::Cup && qty > 1.0 + 1e-9 {
        "cups"
    } else {
        unit.label()
    }
}

fn with_unit(qty: f64, unit: Unit) -> String {
    match unit {
        Unit::Pinch if qty <= 1.0 => "a pinch".to_owned(),
        Unit::Pinch => format!("{} pinches", format_number(qty, None)),
        _ => format!(
            "{} {}",
            format_number(qty, Some(unit)),
            unit_label(unit, qty)
        ),
    }
}

fn range_with_unit(lo: f64, hi: f64, unit: Unit) -> String {
    let label = if unit == Unit::Pinch {
        "pinches"
    } else {
        unit_label(unit, hi)
    };
    format!("{} {label}", range_number(lo, hi, Some(unit)))
}

fn range_number(lo: f64, hi: f64, unit: Option<Unit>) -> String {
    format!(
        "{}{EN_DASH}{}",
        format_number(lo, unit),
        format_number(hi, unit)
    )
}

fn trim_decimal(qty: f64) -> String {
    let text = format!("{qty:.2}");
    text.trim_end_matches('0').trim_end_matches('.').to_owned()
}

const GLYPHS: [(f64, &str); 6] = [
    (0.125, "⅛"),
    (0.25, "¼"),
    (1.0 / 3.0, "⅓"),
    (0.5, "½"),
    (2.0 / 3.0, "⅔"),
    (0.75, "¾"),
];

/// Metric amounts use decimals ("1.25 kg"); spoons, cups and counts use vulgar fractions.
pub fn format_number(qty: f64, unit: Option<Unit>) -> String {
    if matches!(unit, Some(Unit::G | Unit::Kg | Unit::Ml | Unit::L)) {
        return trim_decimal(qty);
    }
    let mut whole = qty.floor();
    let frac = qty - whole;
    if frac > 0.98 {
        whole += 1.0;
        return trim_decimal(whole);
    }
    if frac < 0.02 {
        return trim_decimal(whole);
    }
    match GLYPHS.iter().find(|(f, _)| (f - frac).abs() < 0.02) {
        Some((_, glyph)) if whole < 1.0 => (*glyph).to_owned(),
        Some((_, glyph)) => format!("{whole}{glyph}"),
        None => trim_decimal(qty),
    }
}

/// "12 min" or "12–15 min".
pub fn format_minutes(min: f64, max: Option<f64>) -> String {
    match max {
        Some(max) if (max - min).abs() > 1e-9 => {
            format!("{}{EN_DASH}{} min", trim_decimal(min), trim_decimal(max))
        }
        _ => format!("{} min", trim_decimal(min)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn show(
        qty: f64,
        unit: Unit,
        precise: bool,
        system: Option<UnitSystem>,
        food: Option<&str>,
    ) -> String {
        display_amount(
            qty,
            qty,
            Some(unit),
            &DisplayCtx {
                system,
                precise,
                food,
            },
        )
        .text
    }

    #[test]
    fn metric_rounding_table() {
        let cases = [
            (0.3, Unit::G, false, "a pinch"),
            (2.26, Unit::G, false, "2.5 g"),
            (7.0, Unit::G, false, "5 g"),
            (7.0, Unit::G, true, "7 g"),
            (437.0, Unit::G, false, "440 g"),
            (437.0, Unit::G, true, "435 g"),
            (600.0, Unit::G, false, "600 g"),
            (1200.0, Unit::G, false, "1.2 kg"),
            (1262.0, Unit::G, false, "1.25 kg"),
            (997.0, Unit::G, false, "1 kg"),
            (12.0, Unit::Ml, false, "2½ tsp"),
            (14.9, Unit::Ml, false, "1 tbsp"),
            (130.0, Unit::Ml, false, "130 ml"),
            (333.0, Unit::Ml, false, "325 ml"),
            (333.0, Unit::Ml, true, "330 ml"),
            (1500.0, Unit::Ml, false, "1.5 l"),
        ];
        for (qty, unit, precise, want) in cases {
            assert_eq!(show(qty, unit, precise, None, None), want, "{qty} {unit:?}");
        }
    }

    #[test]
    fn spoon_and_cup_fractions() {
        let cases = [
            (0.1, Unit::Tsp, "a pinch"),
            (0.13, Unit::Tsp, "⅛ tsp"),
            (0.7, Unit::Tsp, "¾ tsp"),
            (1.6, Unit::Tsp, "1½ tsp"),
            (2.9, Unit::Tsp, "1 tbsp"),
            (4.0, Unit::Tsp, "4 tsp"),
            (1.5, Unit::Tbsp, "1½ tbsp"),
            (0.5, Unit::Tbsp, "1½ tsp"),
            (4.0, Unit::Tbsp, "¼ cup"),
            (5.0, Unit::Tbsp, "5 tbsp"),
            (1.0 / 3.0, Unit::Cup, "⅓ cup"),
            (1.5, Unit::Cup, "1½ cups"),
            (2.0 / 3.0, Unit::Cup, "⅔ cup"),
            (1.0, Unit::Cup, "1 cup"),
            (3.0, Unit::Oz, "3 oz"),
            (6.2, Unit::Oz, "6 oz"),
            (20.0, Unit::Oz, "1¼ lb"),
        ];
        for (qty, unit, want) in cases {
            assert_eq!(show(qty, unit, false, None, None), want, "{qty} {unit:?}");
        }
    }

    #[test]
    fn counts_use_fractions_never_decimals() {
        let ctx = DisplayCtx {
            system: None,
            precise: false,
            food: None,
        };
        let cases = [
            (0.3, "¼"),
            (0.5, "½"),
            (1.5, "1½"),
            (2.0, "2"),
            (2.4, "2½"),
            (0.05, "0"),
        ];
        for (qty, want) in cases {
            assert_eq!(display_amount(qty, qty, None, &ctx).text, want);
        }
    }

    #[test]
    fn ranges_use_an_en_dash() {
        let ctx = DisplayCtx {
            system: None,
            precise: false,
            food: None,
        };
        assert_eq!(display_amount(6.0, 7.0, None, &ctx).text, "6–7");
        assert_eq!(
            display_amount(1.5, 2.0, Some(Unit::Tsp), &ctx).text,
            "1½–2 tsp"
        );
        assert_eq!(
            display_amount(800.0, 1200.0, Some(Unit::G), &ctx).text,
            "800 g–1.2 kg"
        );
        assert_eq!(
            display_amount(2.0, 2.2, Some(Unit::Tsp), &ctx).text,
            "2 tsp"
        );
    }

    #[test]
    fn system_conversion() {
        let cases = [
            (250.0, Unit::G, Some("flour-00"), UnitSystem::Us, "2 cups"),
            (500.0, Unit::G, None, UnitSystem::Us, "1 lb"),
            (240.0, Unit::Ml, Some("milk"), UnitSystem::Us, "1 cup"),
            (1.0, Unit::Cup, Some("flour"), UnitSystem::Metric, "120 g"),
            (1.0, Unit::Cup, Some("milk"), UnitSystem::Metric, "240 ml"),
            (8.0, Unit::Oz, None, UnitSystem::Metric, "230 g"),
            (100.0, Unit::G, Some("flour"), UnitSystem::Us, "3½ oz"),
            (1.0, Unit::Tbsp, Some("flour"), UnitSystem::Us, "1 tbsp"),
        ];
        for (qty, unit, food, system, want) in cases {
            assert_eq!(
                show(qty, unit, false, Some(system), food),
                want,
                "{qty} {unit:?}"
            );
        }
    }

    #[test]
    fn awkward_cup_fractions_fall_back_to_weight() {
        assert_eq!(
            show(135.0, Unit::G, false, Some(UnitSystem::Us), Some("flour")),
            "5 oz"
        );
    }

    #[test]
    fn minutes() {
        assert_eq!(format_minutes(12.0, None), "12 min");
        assert_eq!(format_minutes(12.0, Some(15.0)), "12–15 min");
        assert_eq!(format_minutes(1.5, None), "1.5 min");
    }
}
