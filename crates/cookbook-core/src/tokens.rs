use serde::Serialize;

use crate::{
    format::format_minutes,
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
        fan_celsius: Option<f64>,
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

#[derive(Debug, Clone, PartialEq, Serialize)]
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
        fan_celsius: Option<f64>,
        fahrenheit: i32,
        fan_fahrenheit: Option<i32>,
        gas_mark: Option<String>,
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
        let (main, fan) = match rest.split_once('/') {
            Some((main, fan)) => (main, Some(fan)),
            None => (rest, None),
        };
        let celsius = parse_number(main).ok_or("bad temperature")?;
        let fan_celsius = match fan {
            Some(fan) => Some(parse_number(fan).ok_or("bad fan temperature")?),
            None => None,
        };
        return Ok(Segment::Temp {
            celsius,
            fan_celsius,
        });
    }
    if let Some(rest) = body.strip_prefix("timer:") {
        let (time, name) = match rest.split_once('|') {
            Some((time, name)) if !name.trim().is_empty() => (time, Some(name.trim().to_owned())),
            Some(_) => return Err("empty timer name".to_owned()),
            None => (rest, None),
        };
        let (min, max) = match time.split_once(['-', '–']) {
            Some((a, b)) => (
                parse_number(a).ok_or("bad timer minutes")?,
                Some(parse_number(b).ok_or("bad timer minutes")?),
            ),
            None => (parse_number(time).ok_or("bad timer minutes")?, None),
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

fn temp_text(celsius: f64, fan: Option<f64>, system: UnitSystem) -> String {
    let show = |c: f64| match system {
        UnitSystem::Metric => format!("{} °C", c.round() as i64),
        UnitSystem::Us => format!("{} °F", fahrenheit(c, TempKind::Oven)),
    };
    match fan {
        Some(fan) => format!("{} ({} fan)", show(celsius), show(fan)),
        None => show(celsius),
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
                fan_celsius,
            } => RenderedSegment::Temp {
                text: temp_text(*celsius, *fan_celsius, system),
                celsius: *celsius,
                fan_celsius: *fan_celsius,
                fahrenheit: fahrenheit(*celsius, TempKind::Oven),
                fan_fahrenheit: fan_celsius.map(|c| fahrenheit(c, TempKind::Oven)),
                gas_mark: gas_mark(*celsius).map(str::to_owned),
            },
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
                    fan_celsius: None,
                },
            ),
            (
                "{temp:200/180}",
                Segment::Temp {
                    celsius: 200.0,
                    fan_celsius: Some(180.0),
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
                "{timer:12–15|roast}",
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
        assert_eq!(
            temp_text(200.0, Some(180.0), UnitSystem::Metric),
            "200 °C (180 °C fan)"
        );
        assert_eq!(
            temp_text(200.0, Some(180.0), UnitSystem::Us),
            "400 °F (350 °F fan)"
        );
        assert_eq!(temp_text(180.0, None, UnitSystem::Us), "350 °F");
    }

    #[test]
    fn structured_temperature_carries_all_scales() {
        let rendered = render_segments(&kinds("{temp:200/180}"), &[], UnitSystem::Metric);
        match &rendered[0] {
            RenderedSegment::Temp {
                fahrenheit,
                gas_mark,
                fan_fahrenheit,
                ..
            } => {
                assert_eq!(*fahrenheit, 400);
                assert_eq!(*fan_fahrenheit, Some(350));
                assert_eq!(gas_mark.as_deref(), Some("6"));
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn timers_render_with_an_en_dash() {
        let rendered = render_segments(&kinds("{timer:12-15|pasta}"), &[], UnitSystem::Metric);
        assert_eq!(render_text(&rendered), "12–15 min");
    }
}
