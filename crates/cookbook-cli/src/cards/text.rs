//! Text measurement and fitting. The functions are pure and mirrored in `web/src/lib/card/text.ts`.

use ttf_parser::Face as FontFace;

/// The four faces a card uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Face {
    Display,
    Body,
    BodyBold,
    Num,
}

impl Face {
    pub const ALL: [Face; 4] = [Face::Display, Face::Body, Face::BodyBold, Face::Num];

    pub fn font_data(self) -> &'static [u8] {
        match self {
            Face::Display => include_bytes!("../../../../assets/fonts/Bitter-ExtraBold.ttf"),
            Face::Body => {
                include_bytes!("../../../../assets/fonts/AtkinsonHyperlegible-Regular.ttf")
            }
            Face::BodyBold => {
                include_bytes!("../../../../assets/fonts/AtkinsonHyperlegible-Bold.ttf")
            }
            Face::Num => include_bytes!("../../../../assets/fonts/Literata-SemiBold.ttf"),
        }
    }

    fn index(self) -> usize {
        Face::ALL.iter().position(|f| *f == self).unwrap_or(0)
    }
}

pub trait Measure {
    fn width(&self, face: Face, size: f64, text: &str) -> f64;
}

/// Advance widths in em for the characters a recipe card can contain.
const TABLE_END: u32 = 0x2200;
const FALLBACK_EM: f64 = 0.55;

pub struct Metrics {
    advances: Vec<Vec<f32>>,
}

impl Metrics {
    pub fn load() -> Metrics {
        let advances = Face::ALL
            .iter()
            .map(|face| {
                let parsed = FontFace::parse(face.font_data(), 0).expect("the bundled font parses");
                let em = f32::from(parsed.units_per_em());
                (0..TABLE_END)
                    .map(|code| {
                        char::from_u32(code)
                            .and_then(|c| parsed.glyph_index(c))
                            .and_then(|glyph| parsed.glyph_hor_advance(glyph))
                            .map_or(FALLBACK_EM as f32, |advance| f32::from(advance) / em)
                    })
                    .collect()
            })
            .collect();
        Metrics { advances }
    }
}

impl Measure for Metrics {
    fn width(&self, face: Face, size: f64, text: &str) -> f64 {
        let table = &self.advances[face.index()];
        let ems: f64 = text
            .chars()
            .map(|c| table.get(c as usize).map_or(FALLBACK_EM, |a| f64::from(*a)))
            .sum();
        ems * size
    }
}

/// Greedy word wrap; a word wider than the line gets a line of its own.
pub fn wrap(measure: &dyn Measure, face: Face, size: f64, text: &str, max: f64) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if current.is_empty() {
            current = word.to_owned();
            continue;
        }
        let candidate = format!("{current} {word}");
        if measure.width(face, size, &candidate) <= max {
            current = candidate;
        } else {
            lines.push(std::mem::replace(&mut current, word.to_owned()));
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

/// Shortens `text` with an ellipsis until it fits `max`.
pub fn ellipsize(measure: &dyn Measure, face: Face, size: f64, text: &str, max: f64) -> String {
    if measure.width(face, size, text) <= max {
        return text.to_owned();
    }
    let mut kept: Vec<char> = text.chars().collect();
    while kept.pop().is_some() {
        let candidate: String = kept.iter().collect::<String>().trim_end().to_owned() + "...";
        if measure.width(face, size, &candidate) <= max {
            return candidate;
        }
    }
    "...".to_owned()
}

/// The first of `sizes` at which `text` fits in `max_lines`; the last size with an ellipsis when none does.
pub fn fit_lines(
    measure: &dyn Measure,
    face: Face,
    sizes: &[f64],
    text: &str,
    max: f64,
    max_lines: usize,
) -> (f64, Vec<String>) {
    for &size in sizes {
        let lines = wrap(measure, face, size, text, max);
        if lines.len() <= max_lines && lines.iter().all(|l| measure.width(face, size, l) <= max) {
            return (size, lines);
        }
    }
    let size = sizes[sizes.len() - 1];
    let mut lines = wrap(measure, face, size, text, max);
    if lines.len() > max_lines {
        let rest = lines.split_off(max_lines - 1).join(" ");
        lines.push(rest);
    }
    let lines = lines
        .iter()
        .map(|line| ellipsize(measure, face, size, line, max))
        .collect();
    (size, lines)
}

/// How many ingredient lines to show, and how many are left out. One line is spent on "+ n more".
pub fn ingredient_window(total: usize, fit: usize, cap: usize) -> (usize, usize) {
    let capacity = fit.min(cap);
    if total <= capacity {
        (total, 0)
    } else if capacity <= 1 {
        (0, total)
    } else {
        (capacity - 1, total - (capacity - 1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every character is 10 units wide at size 10, so widths are easy to reason about.
    struct Mono;
    impl Measure for Mono {
        fn width(&self, _: Face, size: f64, text: &str) -> f64 {
            text.chars().count() as f64 * size
        }
    }

    #[test]
    fn words_wrap_greedily() {
        let lines = wrap(&Mono, Face::Body, 1.0, "aa bb cc dd", 5.0);
        assert_eq!(lines, ["aa bb", "cc dd"]);
        assert_eq!(
            wrap(&Mono, Face::Body, 1.0, "abcdefgh ij", 5.0),
            ["abcdefgh", "ij"]
        );
    }

    #[test]
    fn long_text_is_shortened_with_an_ellipsis() {
        assert_eq!(ellipsize(&Mono, Face::Body, 1.0, "abcdefgh", 5.0), "ab...");
        assert_eq!(ellipsize(&Mono, Face::Body, 1.0, "abc", 5.0), "abc");
    }

    #[test]
    fn titles_shrink_before_they_are_cut() {
        let (size, lines) = fit_lines(&Mono, Face::Display, &[2.0, 1.0], "aaaa bbbb cccc", 10.0, 2);
        assert_eq!((size, lines.len()), (1.0, 2));
        let (size, lines) = fit_lines(
            &Mono,
            Face::Display,
            &[2.0, 1.0],
            "aaaa bbbb cccc dddd eeee",
            10.0,
            2,
        );
        assert_eq!(size, 1.0);
        assert_eq!(lines.len(), 2);
        assert!(lines[1].ends_with("..."));
    }

    #[test]
    fn the_ingredient_list_spends_a_line_on_the_remainder() {
        assert_eq!(ingredient_window(5, 8, 12), (5, 0));
        assert_eq!(ingredient_window(20, 8, 12), (7, 13));
        assert_eq!(ingredient_window(20, 30, 12), (11, 9));
        assert_eq!(ingredient_window(3, 1, 12), (0, 3));
        assert_eq!(ingredient_window(3, 0, 12), (0, 3));
    }

    #[test]
    fn the_real_fonts_have_sensible_widths() {
        let metrics = Metrics::load();
        let wide = metrics.width(Face::Display, 100.0, "Beef Wellington");
        let narrow = metrics.width(Face::Body, 10.0, "Beef Wellington");
        assert!(wide > 500.0 && narrow < wide);
        assert!(metrics.width(Face::Num, 10.0, "ċġħż") > 0.0);
    }
}
