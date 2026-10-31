use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::schema::Unit;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum UnitSystem {
    Metric,
    Us,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dimension {
    Mass,
    Volume,
    Other,
}

/// Base units are grams and millilitres. A cup is the metric 240 ml, so a US fluid ounce is 30 ml.
impl Unit {
    pub fn dimension(self) -> Dimension {
        match self {
            Unit::G | Unit::Kg | Unit::Oz | Unit::Lb => Dimension::Mass,
            Unit::Ml | Unit::L | Unit::Tsp | Unit::Tbsp | Unit::Cup | Unit::Floz => {
                Dimension::Volume
            }
            Unit::Pinch => Dimension::Other,
        }
    }

    fn factor(self) -> f64 {
        match self {
            Unit::G | Unit::Ml => 1.0,
            Unit::Kg | Unit::L => 1000.0,
            Unit::Oz => 28.349_523_125,
            Unit::Lb => 453.592_37,
            Unit::Tsp => 5.0,
            Unit::Tbsp => 15.0,
            Unit::Cup => 240.0,
            Unit::Floz => 30.0,
            Unit::Pinch => 0.0,
        }
    }

    /// The system a unit belongs to; spoons and pinches belong to neither.
    pub fn system(self) -> Option<UnitSystem> {
        match self {
            Unit::G | Unit::Kg | Unit::Ml | Unit::L => Some(UnitSystem::Metric),
            Unit::Oz | Unit::Lb | Unit::Cup | Unit::Floz => Some(UnitSystem::Us),
            Unit::Tsp | Unit::Tbsp | Unit::Pinch => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Unit::G => "g",
            Unit::Kg => "kg",
            Unit::Ml => "ml",
            Unit::L => "l",
            Unit::Tsp => "tsp",
            Unit::Tbsp => "tbsp",
            Unit::Cup => "cup",
            Unit::Oz => "oz",
            Unit::Lb => "lb",
            Unit::Floz => "fl oz",
            Unit::Pinch => "pinch",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Density {
    pub g_per_ml: f64,
    /// Liquids stay in millilitres when a metric view converts cups.
    pub liquid: bool,
}

/// Grams per 240 ml cup.
const DENSITIES: &[(&str, f64, bool)] = &[
    ("flour", 120.0, false),
    ("flour-00", 120.0, false),
    ("flour-plain", 120.0, false),
    ("flour-self-raising", 120.0, false),
    ("flour-bread", 130.0, false),
    ("flour-wholemeal", 130.0, false),
    ("cornflour", 130.0, false),
    ("semolina", 165.0, false),
    ("sugar", 200.0, false),
    ("sugar-caster", 200.0, false),
    ("sugar-granulated", 200.0, false),
    ("sugar-brown", 210.0, false),
    ("sugar-icing", 120.0, false),
    ("butter", 227.0, false),
    ("milk", 240.0, true),
    ("water", 240.0, true),
    ("cream", 240.0, true),
    ("yoghurt", 245.0, false),
    ("olive-oil", 216.0, true),
    ("oil", 216.0, true),
    ("honey", 340.0, false),
    ("rice", 190.0, false),
    ("couscous", 175.0, false),
    ("lentils", 190.0, false),
    ("oats", 90.0, false),
    ("cocoa", 85.0, false),
    ("salt", 290.0, false),
    ("breadcrumbs", 110.0, false),
    ("ground-almonds", 96.0, false),
];

/// Looks a food up by id, dropping trailing segments until one matches (`flour-00-fine` finds `flour-00`).
pub fn density(food: &str) -> Option<Density> {
    let mut id = food;
    loop {
        if let Some((_, per_cup, liquid)) = DENSITIES.iter().find(|(name, _, _)| *name == id) {
            return Some(Density {
                g_per_ml: per_cup / 240.0,
                liquid: *liquid,
            });
        }
        id = id.rsplit_once('-')?.0;
    }
}

pub fn known_foods() -> impl Iterator<Item = &'static str> {
    DENSITIES.iter().map(|(name, _, _)| *name)
}

/// Converts within a dimension, or across mass and volume when the food has a known density.
pub fn convert(qty: f64, from: Unit, to: Unit, food: Option<&str>) -> Option<f64> {
    if from == to {
        return Some(qty);
    }
    let (a, b) = (from.dimension(), to.dimension());
    if a == Dimension::Other || b == Dimension::Other {
        return None;
    }
    let base = qty * from.factor();
    if a == b {
        return Some(base / to.factor());
    }
    let d = density(food?)?.g_per_ml;
    let converted = if a == Dimension::Mass {
        base / d
    } else {
        base * d
    };
    Some(converted / to.factor())
}

pub(crate) fn near(value: f64, target: f64, tolerance: f64) -> bool {
    (value - target).abs() <= tolerance * target.abs().max(f64::EPSILON)
}

const CUP_FRACTIONS: [f64; 7] = [0.0, 0.25, 1.0 / 3.0, 0.5, 2.0 / 3.0, 0.75, 1.0];

/// The cup value nearest to `qty` on the quarter and third grid.
pub(crate) fn nearest_cup(qty: f64) -> f64 {
    let whole = qty.floor();
    CUP_FRACTIONS
        .iter()
        .map(|f| whole + f)
        .min_by(|a, b| (a - qty).abs().total_cmp(&(b - qty).abs()))
        .unwrap_or(qty)
}

/// Moves to the unit that reads best: 1200 g becomes 1.2 kg, but 4 tsp stays put because 1⅓ tbsp reads worse.
pub fn normalise(qty: f64, unit: Unit) -> (f64, Unit) {
    match unit {
        Unit::G if qty >= 1000.0 => (qty / 1000.0, Unit::Kg),
        Unit::Kg if qty < 1.0 => (qty * 1000.0, Unit::G),
        Unit::Ml if qty >= 1000.0 => (qty / 1000.0, Unit::L),
        Unit::L if qty < 1.0 => (qty * 1000.0, Unit::Ml),
        Unit::Tsp if qty >= 3.0 && near(qty / 3.0 * 2.0, (qty / 3.0 * 2.0).round(), 0.05) => {
            (qty / 3.0, Unit::Tbsp)
        }
        Unit::Tbsp if qty < 1.0 => (qty * 3.0, Unit::Tsp),
        Unit::Tbsp if qty >= 4.0 => {
            let cups = qty / 16.0;
            if near(cups, nearest_cup(cups), 0.05) {
                (cups, Unit::Cup)
            } else {
                (qty, Unit::Tbsp)
            }
        }
        Unit::Cup if qty < 0.25 => normalise(qty * 16.0, Unit::Tbsp),
        Unit::Floz if qty >= 8.0 => (qty / 8.0, Unit::Cup),
        Unit::Oz if qty >= 16.0 => (qty / 16.0, Unit::Lb),
        Unit::Lb if qty < 1.0 => (qty * 16.0, Unit::Oz),
        _ => (qty, unit),
    }
}

const METRIC_MASS: [Unit; 2] = [Unit::G, Unit::Kg];
const METRIC_VOLUME: [Unit; 4] = [Unit::Ml, Unit::L, Unit::Tsp, Unit::Tbsp];
const US_MASS: [Unit; 2] = [Unit::Oz, Unit::Lb];
const US_VOLUME: [Unit; 4] = [Unit::Tsp, Unit::Tbsp, Unit::Cup, Unit::Floz];

/// The units a cook can pick for an amount in `system`, each with the same physical amount, in menu
/// order. Spoons belong to both systems. Pinches and counts have no choices, so the list is empty.
pub fn unit_options(qty: f64, unit: Unit, system: UnitSystem) -> Vec<(f64, Unit)> {
    let units: &[Unit] = match (unit.dimension(), system) {
        (Dimension::Mass, UnitSystem::Metric) => &METRIC_MASS,
        (Dimension::Mass, UnitSystem::Us) => &US_MASS,
        (Dimension::Volume, UnitSystem::Metric) => &METRIC_VOLUME,
        (Dimension::Volume, UnitSystem::Us) => &US_VOLUME,
        (Dimension::Other, _) => return Vec::new(),
    };
    units
        .iter()
        .filter_map(|&to| Some((convert(qty, unit, to, None)?, to)))
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TempKind {
    Oven,
    Internal,
}

/// Oven dials move in steps of 25 °F; internal and food temperatures round to the nearest degree.
pub fn fahrenheit(celsius: f64, kind: TempKind) -> i32 {
    let step = match kind {
        TempKind::Oven => 25.0,
        TempKind::Internal => 1.0,
    };
    let f = celsius * 9.0 / 5.0 + 32.0;
    ((f / step).round() * step) as i32
}

const GAS_MARKS: [(f64, &str); 12] = [
    (110.0, "¼"),
    (120.0, "½"),
    (140.0, "1"),
    (150.0, "2"),
    (160.0, "3"),
    (180.0, "4"),
    (190.0, "5"),
    (200.0, "6"),
    (220.0, "7"),
    (230.0, "8"),
    (240.0, "9"),
    (260.0, "10"),
];

/// The gas mark whose temperature is the highest one not above `celsius`.
pub fn gas_mark(celsius: f64) -> Option<&'static str> {
    GAS_MARKS
        .iter()
        .rev()
        .find(|(c, _)| celsius >= *c)
        .map(|(_, mark)| *mark)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_dimension_conversions() {
        let cases = [
            (1.5, Unit::Kg, Unit::G, 1500.0),
            (500.0, Unit::Ml, Unit::L, 0.5),
            (3.0, Unit::Tsp, Unit::Tbsp, 1.0),
            (1.0, Unit::Cup, Unit::Tbsp, 16.0),
            (1.0, Unit::Lb, Unit::Oz, 16.0),
            (2.0, Unit::Floz, Unit::Ml, 60.0),
        ];
        for (qty, from, to, expected) in cases {
            let got = convert(qty, from, to, None).unwrap();
            assert!(
                (got - expected).abs() < 1e-6,
                "{qty} {from:?} to {to:?}: {got}"
            );
        }
    }

    #[test]
    fn cross_dimension_needs_a_density() {
        assert!(convert(1.0, Unit::Cup, Unit::G, None).is_none());
        assert!(convert(1.0, Unit::Cup, Unit::G, Some("mystery")).is_none());
        assert!((convert(1.0, Unit::Cup, Unit::G, Some("flour-00")).unwrap() - 120.0).abs() < 1e-9);
        assert!((convert(454.0, Unit::G, Unit::Cup, Some("butter")).unwrap() - 2.0).abs() < 0.01);
        assert!(convert(1.0, Unit::Pinch, Unit::G, Some("salt")).is_none());
    }

    #[test]
    fn density_falls_back_to_the_parent_food() {
        assert_eq!(density("flour-00-fine"), density("flour-00"));
        assert!(density("unobtainium").is_none());
        assert!(known_foods().count() >= 20);
    }

    #[test]
    fn normalisation_table() {
        let cases = [
            (1200.0, Unit::G, 1.2, Unit::Kg),
            (0.5, Unit::Kg, 500.0, Unit::G),
            (1500.0, Unit::Ml, 1.5, Unit::L),
            (3.0, Unit::Tsp, 1.0, Unit::Tbsp),
            (4.0, Unit::Tsp, 4.0, Unit::Tsp),
            (0.5, Unit::Tbsp, 1.5, Unit::Tsp),
            (4.0, Unit::Tbsp, 0.25, Unit::Cup),
            (5.0, Unit::Tbsp, 5.0, Unit::Tbsp),
            (0.125, Unit::Cup, 2.0, Unit::Tbsp),
            (20.0, Unit::Oz, 1.25, Unit::Lb),
            (0.5, Unit::Lb, 8.0, Unit::Oz),
        ];
        for (qty, unit, want_qty, want_unit) in cases {
            let (q, u) = normalise(qty, unit);
            assert_eq!(u, want_unit, "{qty} {unit:?}");
            assert!((q - want_qty).abs() < 1e-9, "{qty} {unit:?}: {q}");
        }
    }

    #[test]
    fn options_stay_within_the_chosen_system() {
        let units = |qty, unit, system| -> Vec<Unit> {
            unit_options(qty, unit, system)
                .into_iter()
                .map(|(_, u)| u)
                .collect()
        };
        assert_eq!(
            units(500.0, Unit::G, UnitSystem::Metric),
            [Unit::G, Unit::Kg]
        );
        assert_eq!(units(500.0, Unit::G, UnitSystem::Us), [Unit::Oz, Unit::Lb]);
        assert_eq!(
            units(2.0, Unit::Cup, UnitSystem::Metric),
            [Unit::Ml, Unit::L, Unit::Tsp, Unit::Tbsp]
        );
        assert_eq!(
            units(30.0, Unit::Ml, UnitSystem::Us),
            [Unit::Tsp, Unit::Tbsp, Unit::Cup, Unit::Floz]
        );
        assert!(unit_options(1.0, Unit::Pinch, UnitSystem::Metric).is_empty());
    }

    #[test]
    fn every_option_converts_back_to_the_written_amount() {
        for unit in [Unit::G, Unit::Ml, Unit::Tsp, Unit::Oz, Unit::Cup] {
            for system in [UnitSystem::Metric, UnitSystem::Us] {
                for (qty, to) in unit_options(7.0, unit, system) {
                    let back = convert(qty, to, unit, None).unwrap();
                    assert!(
                        near(back, 7.0, 1e-9),
                        "{unit:?} via {to:?} came back as {back}"
                    );
                }
            }
        }
        let kilos = unit_options(1500.0, Unit::G, UnitSystem::Metric);
        assert!(near(kilos[1].0, 1.5, 1e-9));
    }

    #[test]
    fn temperatures() {
        assert_eq!(fahrenheit(180.0, TempKind::Oven), 350);
        assert_eq!(fahrenheit(200.0, TempKind::Oven), 400);
        assert_eq!(fahrenheit(220.0, TempKind::Oven), 425);
        assert_eq!(fahrenheit(63.0, TempKind::Internal), 145);
        assert_eq!(fahrenheit(52.0, TempKind::Internal), 126);
        assert_eq!(fahrenheit(55.0, TempKind::Internal), 131);
    }

    #[test]
    fn gas_marks() {
        let cases = [
            (140.0, Some("1")),
            (150.0, Some("2")),
            (160.0, Some("3")),
            (170.0, Some("3")),
            (180.0, Some("4")),
            (200.0, Some("6")),
            (210.0, Some("6")),
            (240.0, Some("9")),
            (100.0, None),
        ];
        for (c, mark) in cases {
            assert_eq!(gas_mark(c), mark, "{c} °C");
        }
    }
}
