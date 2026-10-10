use schemars::JsonSchema;
use serde::Serialize;

use crate::{
    format::{RANGE_DASH, format_minutes},
    scale::ScaledIngredient,
    units::{TempKind, UnitSystem, fahrenheit, gas_mark},
};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Segment {
    Text {
        text: String,
    },
    Ingredient {
        key: String,
        amount_only: bool,
        /// A share of the ingredient, for one split across several steps.
        fraction: Option<f64>,
    },
    Temp {
        celsius: f64,
        max_celsius: Option<f64>,
        fan_celsius: Option<f64>,
        /// An internal or food temperature: exact degrees, no oven steps, no gas mark.
        internal: bool,
    },
    Timer {
        min: f64,
        max: Option<f64>,
        name: Option<String>,
    },
    Invalid {
        raw: String,
        reason: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RenderedSegment {
    Text {
        text: String,
    },
    Ingredient {
        key: String,
        text: String,
        scaled: bool,
    },
    Temp {
        text: String,
        celsius: f64,
        max_celsius: Option<f64>,
        fan_celsius: Option<f64>,
        fahrenheit: i32,
        max_fahrenheit: Option<i32>,
        fan_fahrenheit: Option<i32>,
        gas_mark: Option<String>,
        internal: bool,
    },
    Timer {
        text: String,
        min_minutes: f64,
        max_minutes: Option<f64>,
        name: Option<String>,
    },
}

impl RenderedSegment {
    pub fn text(&self) -> &str {
        match self {
            RenderedSegment::Text { text }
            | RenderedSegment::Ingredient { text, .. }
            | RenderedSegment::Temp { text, .. }
            | RenderedSegment::Timer { text, .. } => text,
        }
    }
}

fn parse_number(text: &str) -> Option<f64> {
    let value: f64 = text.trim().parse().ok()?;
    (value.is_finite() && value > 0.0).then_some(value)
}

fn parse_fraction(text: &str) -> Option<f64> {
    match text.split_once('/') {
        Some((n, d)) => {
            let (n, d) = (parse_number(n)?, parse_number(d)?);
            Some(n / d)
        }
        None => parse_number(text),
    }
}

const RANGE_DASHES: [char; 2] = ['-', '\u{2013}'];

/// Separates a trailing unit letter (`s`, `m` or `h`) from a duration, as minutes per unit.
fn split_duration(text: &str) -> (&str, Option<f64>) {
    let text = text.trim();
    match text.chars().last() {
        Some('s') => (&text[..text.len() - 1], Some(1.0 / 60.0)),
        Some('m') => (&text[..text.len() - 1], Some(1.0)),
        Some('h') => (&text[..text.len() - 1], Some(60.0)),
        _ => (text, None),
    }
}

fn parse_duration(text: &str, unit: Option<f64>) -> Result<f64, String> {
    parse_number(text)
        .map(|value| value * unit.unwrap_or(1.0))
        .ok_or_else(|| "bad timer duration".to_owned())
}

fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

fn parse_token(body: &str) -> Result<Segment, String> {
    if let Some(rest) = body.strip_prefix('@') {
        let (head, fraction) = match rest.split_once('*') {
            Some((head, frac)) => (
                head,
                Some(parse_fraction(frac).ok_or_else(|| format!("bad fraction '{frac}'"))?),
            ),
            None => (rest, None),
        };
        let (key, amount_only) = match head.split_once(':') {
            Some((key, "amount")) => (key, true),
            Some((_, other)) => return Err(format!("unknown ingredient modifier '{other}'")),
            None => (head, false),
        };
        if !valid_key(key) {
            return Err(format!("bad ingredient key '{key}'"));
        }
        return Ok(Segment::Ingredient {
            key: key.to_owned(),
            amount_only,
            fraction,
        });
    }
    if let Some(rest) = body.strip_prefix("temp:") {
        let (rest, internal) = match rest.strip_suffix('!') {
            Some(rest) => (rest, true),
            None => (rest, false),
        };
        let (main, fan) = match rest.split_once('/') {
            Some((main, fan)) => (main, Some(fan)),
            None => (rest, None),
        };
        let (celsius, max_celsius) = match main.split_once(RANGE_DASHES) {
            Some((a, b)) => (
                parse_number(a).ok_or("bad temperature")?,
                Some(parse_number(b).ok_or("bad temperature")?),
            ),
            None => (parse_number(main).ok_or("bad temperature")?, None),
        };
        if max_celsius.is_some_and(|m| m <= celsius) {
            return Err("temperature range must increase".to_owned());
        }
        let fan_celsius = match fan {
            Some(_) if internal => {
                return Err("an internal temperature has no fan value".to_owned());
            }
            Some(_) if max_celsius.is_some() => {
                return Err("a temperature range has no fan value".to_owned());
            }
            Some(fan) => Some(parse_number(fan).ok_or("bad fan temperature")?),
            None => None,
        };
        return Ok(Segment::Temp {
            celsius,
            max_celsius,
            fan_celsius,
            internal,
        });
    }
    if let Some(rest) = body.strip_prefix("timer:") {
        let (time, name) = match rest.split_once('|') {
            Some((time, name)) if !name.trim().is_empty() => (time, Some(name.trim().to_owned())),
            Some(_) => return Err("empty timer name".to_owned()),
            None => (rest, None),
        };
        let (min, max) = match time.split_once(RANGE_DASHES) {
            Some((a, b)) => {
                let (b, b_unit) = split_duration(b);
                let (a, a_unit) = split_duration(a);
                let a_unit = a_unit.or(b_unit);
                (parse_duration(a, a_unit)?, Some(parse_duration(b, b_unit)?))
            }
            None => {
                let (time, unit) = split_duration(time);
                (parse_duration(time, unit)?, None)
            }
        };
        if max.is_some_and(|m| m <= min) {
            return Err("timer range must increase".to_owned());
        }
        return Ok(Segment::Timer { min, max, name });
    }
    Err("unknown token".to_owned())
}

/// Splits step text into plain text and tokens. Malformed tokens become `Invalid` segments.
pub fn parse_tokens(text: &str) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        if open > 0 {
            segments.push(Segment::Text {
                text: rest[..open].to_owned(),
            });
        }
        let after = &rest[open..];
        let Some(close) = after.find('}') else {
            segments.push(Segment::Invalid {
                raw: after.to_owned(),
                reason: "unclosed '{'".to_owned(),
            });
            return segments;
        };
        let raw = &after[..=close];
        segments.push(match parse_token(&raw[1..raw.len() - 1]) {
            Ok(segment) => segment,
            Err(reason) => Segment::Invalid {
                raw: raw.to_owned(),
                reason,
            },
        });
        rest = &after[close + 1..];
    }
    if !rest.is_empty() {
        segments.push(Segment::Text {
            text: rest.to_owned(),
        });
    }
    segments
}

pub fn temp_text(
    celsius: f64,
    max_celsius: Option<f64>,
    fan: Option<f64>,
    kind: TempKind,
    system: UnitSystem,
) -> String {
    let number = |c: f64| match system {
        UnitSystem::Metric => c.round() as i64,
        UnitSystem::Us => i64::from(fahrenheit(c, kind)),
    };
    let unit = match system {
        UnitSystem::Metric => "°C",
        UnitSystem::Us => "°F",
    };
    let show = |c: f64| format!("{} {unit}", number(c));
    match (max_celsius, fan) {
        (Some(max), _) => format!("{}{RANGE_DASH}{} {unit}", number(celsius), number(max)),
        (None, Some(fan)) => format!("{} ({} fan)", show(celsius), show(fan)),
        (None, None) => show(celsius),
    }
}

pub fn render_segments(
    segments: &[Segment],
    ingredients: &[ScaledIngredient],
    system: UnitSystem,
) -> Vec<RenderedSegment> {
    segments
        .iter()
        .map(|segment| match segment {
            Segment::Text { text } => RenderedSegment::Text { text: text.clone() },
            Segment::Invalid { raw, .. } => RenderedSegment::Text { text: raw.clone() },
            Segment::Ingredient {
                key,
                amount_only,
                fraction,
            } => match ingredients.iter().find(|i| i.key.as_deref() == Some(key)) {
                Some(ingredient) => RenderedSegment::Ingredient {
                    key: key.clone(),
                    text: ingredient.inline_text(*amount_only, *fraction),
                    scaled: ingredient.scaled,
                },
                None => RenderedSegment::Text { text: key.clone() },
            },
            Segment::Temp {
                celsius,
                max_celsius,
                fan_celsius,
                internal,
            } => {
                let kind = if *internal {
                    TempKind::Internal
                } else {
                    TempKind::Oven
                };
                let single_oven = !internal && max_celsius.is_none();
                RenderedSegment::Temp {
                    text: temp_text(*celsius, *max_celsius, *fan_celsius, kind, system),
                    celsius: *celsius,
                    max_celsius: *max_celsius,
                    fan_celsius: *fan_celsius,
                    fahrenheit: fahrenheit(*celsius, kind),
                    max_fahrenheit: max_celsius.map(|c| fahrenheit(c, kind)),
                    fan_fahrenheit: fan_celsius.map(|c| fahrenheit(c, kind)),
                    gas_mark: single_oven
                        .then(|| gas_mark(*celsius).map(str::to_owned))
                        .flatten(),
                    internal: *internal,
                }
            }
            Segment::Timer { min, max, name } => RenderedSegment::Timer {
                text: format_minutes(*min, *max),
                min_minutes: *min,
                max_minutes: *max,
                name: name.clone(),
            },
        })
        .collect()
}

pub fn render_text(segments: &[RenderedSegment]) -> String {
    segments.iter().map(RenderedSegment::text).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(text: &str) -> Vec<Segment> {
        parse_tokens(text)
    }

    #[test]
    fn parses_every_token_form() {
        let cases = [
            (
                "{@pasta}",
                Segment::Ingredient {
                    key: "pasta".into(),
                    amount_only: false,
                    fraction: None,
                },
            ),
            (
                "{@pasta:amount}",
                Segment::Ingredient {
                    key: "pasta".into(),
                    amount_only: true,
                    fraction: None,
                },
            ),
            (
                "{@sugar*1/2}",
                Segment::Ingredient {
                    key: "sugar".into(),
                    amount_only: false,
                    fraction: Some(0.5),
                },
            ),
            (
                "{@sugar:amount*0.25}",
                Segment::Ingredient {
                    key: "sugar".into(),
                    amount_only: true,
                    fraction: Some(0.25),
                },
            ),
            (
                "{temp:200}",
                Segment::Temp {
                    celsius: 200.0,
                    max_celsius: None,
                    fan_celsius: None,
                    internal: false,
                },
            ),
            (
                "{temp:200/180}",
                Segment::Temp {
                    celsius: 200.0,
                    max_celsius: None,
                    fan_celsius: Some(180.0),
                    internal: false,
                },
            ),
            (
                "{temp:63!}",
                Segment::Temp {
                    celsius: 63.0,
                    max_celsius: None,
                    fan_celsius: None,
                    internal: true,
                },
            ),
            (
                "{temp:52-55!}",
                Segment::Temp {
                    celsius: 52.0,
                    max_celsius: Some(55.0),
                    fan_celsius: None,
                    internal: true,
                },
            ),
            (
                "{temp:180\u{2013}200}",
                Segment::Temp {
                    celsius: 180.0,
                    max_celsius: Some(200.0),
                    fan_celsius: None,
                    internal: false,
                },
            ),
            (
                "{timer:0.5}",
                Segment::Timer {
                    min: 0.5,
                    max: None,
                    name: None,
                },
            ),
            (
                "{timer:30s}",
                Segment::Timer {
                    min: 0.5,
                    max: None,
                    name: None,
                },
            ),
            (
                "{timer:4h}",
                Segment::Timer {
                    min: 240.0,
                    max: None,
                    name: None,
                },
            ),
            (
                "{timer:3-4h|braise}",
                Segment::Timer {
                    min: 180.0,
                    max: Some(240.0),
                    name: Some("braise".into()),
                },
            ),
            (
                "{timer:45m-1.5h}",
                Segment::Timer {
                    min: 45.0,
                    max: Some(90.0),
                    name: None,
                },
            ),
            (
                "{timer:12}",
                Segment::Timer {
                    min: 12.0,
                    max: None,
                    name: None,
                },
            ),
            (
                "{timer:12-15}",
                Segment::Timer {
                    min: 12.0,
                    max: Some(15.0),
                    name: None,
                },
            ),
            (
                "{timer:12|pasta}",
                Segment::Timer {
                    min: 12.0,
                    max: None,
                    name: Some("pasta".into()),
                },
            ),
            (
                "{timer:12\u{2013}15|roast}",
                Segment::Timer {
                    min: 12.0,
                    max: Some(15.0),
                    name: Some("roast".into()),
                },
            ),
        ];
        for (text, want) in cases {
            assert_eq!(kinds(text), vec![want], "{text}");
        }
    }

    #[test]
    fn keeps_surrounding_text() {
        let segments = kinds("Add {@salt} and bake at {temp:180}.");
        assert_eq!(segments.len(), 5);
        assert_eq!(
            segments[0],
            Segment::Text {
                text: "Add ".into()
            }
        );
        assert_eq!(segments[4], Segment::Text { text: ".".into() });
    }

    #[test]
    fn malformed_tokens_are_invalid() {
        let cases = [
            "{@}",
            "{@a b}",
            "{@a:weight}",
            "{@a*0}",
            "{@a*1/0}",
            "{temp:hot}",
            "{temp:200/}",
            "{temp:55-52!}",
            "{temp:52-55/50}",
            "{temp:63!/60}",
            "{temp:!}",
            "{timer:5x}",
            "{timer:h}",
            "{timer:}",
            "{timer:15-12}",
            "{timer:5|}",
            "{bake:5}",
            "{unclosed",
        ];
        for text in cases {
            let segments = kinds(text);
            assert!(
                matches!(segments.last(), Some(Segment::Invalid { .. })),
                "{text} gave {segments:?}"
            );
        }
    }

    #[test]
    fn temperature_rendering() {
        let oven = TempKind::Oven;
        let metric = UnitSystem::Metric;
        let us = UnitSystem::Us;
        assert_eq!(
            temp_text(200.0, None, Some(180.0), oven, metric),
            "200 °C (180 °C fan)"
        );
        assert_eq!(
            temp_text(200.0, None, Some(180.0), oven, us),
            "400 °F (350 °F fan)"
        );
        assert_eq!(temp_text(180.0, None, None, oven, us), "350 °F");
        assert_eq!(temp_text(180.0, Some(200.0), None, oven, us), "350-400 °F");
    }

    #[test]
    fn internal_temperatures_round_to_one_degree() {
        let internal = TempKind::Internal;
        assert_eq!(
            temp_text(52.0, Some(55.0), None, internal, UnitSystem::Metric),
            "52-55 °C"
        );
        assert_eq!(
            temp_text(52.0, Some(55.0), None, internal, UnitSystem::Us),
            "126-131 °F"
        );
        assert_eq!(
            temp_text(63.0, None, None, internal, UnitSystem::Us),
            "145 °F"
        );
        let rendered = render_segments(&kinds("{temp:63!}"), &[], UnitSystem::Us);
        assert_eq!(render_text(&rendered), "145 °F");
        match &rendered[0] {
            RenderedSegment::Temp {
                gas_mark, internal, ..
            } => {
                assert_eq!(*gas_mark, None);
                assert!(*internal);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn structured_temperature_carries_all_scales() {
        let rendered = render_segments(&kinds("{temp:200/180}"), &[], UnitSystem::Metric);
        match &rendered[0] {
            RenderedSegment::Temp {
                fahrenheit,
                gas_mark,
                fan_fahrenheit,
                max_fahrenheit,
                internal,
                ..
            } => {
                assert_eq!(*fahrenheit, 400);
                assert_eq!(*fan_fahrenheit, Some(350));
                assert_eq!(*max_fahrenheit, None);
                assert_eq!(gas_mark.as_deref(), Some("6"));
                assert!(!*internal);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn temperature_ranges_carry_both_ends() {
        let rendered = render_segments(&kinds("{temp:52-55!}"), &[], UnitSystem::Metric);
        assert_eq!(render_text(&rendered), "52-55 °C");
        match &rendered[0] {
            RenderedSegment::Temp {
                fahrenheit,
                max_fahrenheit,
                gas_mark,
                ..
            } => {
                assert_eq!((*fahrenheit, *max_fahrenheit), (126, Some(131)));
                assert_eq!(*gas_mark, None);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn timers_render_with_an_en_dash() {
        let rendered = render_segments(&kinds("{timer:12-15|pasta}"), &[], UnitSystem::Metric);
        assert_eq!(render_text(&rendered), "12-15 min");
    }

    #[test]
    fn timers_read_naturally() {
        let text = |t: &str| render_text(&render_segments(&kinds(t), &[], UnitSystem::Metric));
        assert_eq!(text("{timer:0.5}"), "30 sec");
        assert_eq!(text("{timer:30s}"), "30 sec");
        assert_eq!(text("{timer:240}"), "4 h");
        assert_eq!(text("{timer:4h}"), "4 h");
        assert_eq!(text("{timer:90}"), "1 h 30 min");
        assert_eq!(text("{timer:3-4h}"), "3-4 h");
    }
}
