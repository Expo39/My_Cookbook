//! QR codes as a grid of modules, so the native card renderer and the browser canvas draw the same symbol.

use qrcode::{Color, EcLevel, QrCode};
use serde::Serialize;

/// A square symbol without its quiet zone: `dark[y * size + x]`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct QrMatrix {
    pub size: usize,
    pub dark: Vec<bool>,
}

impl QrMatrix {
    pub fn is_dark(&self, x: usize, y: usize) -> bool {
        self.dark[y * self.size + x]
    }

    /// SVG path data for the dark modules, one rectangle per horizontal run.
    pub fn svg_path(&self, x: i32, y: i32, module: i32) -> String {
        let mut path = String::new();
        for row in 0..self.size {
            let mut column = 0;
            while column < self.size {
                if !self.is_dark(column, row) {
                    column += 1;
                    continue;
                }
                let start = column;
                while column < self.size && self.is_dark(column, row) {
                    column += 1;
                }
                let run = (column - start) as i32 * module;
                path.push_str(&format!(
                    "M{} {}h{run}v{module}h-{run}z",
                    x + start as i32 * module,
                    y + row as i32 * module,
                ));
            }
        }
        path
    }
}

/// `None` when the text is too long for any symbol.
pub fn qr_matrix(text: &str) -> Option<QrMatrix> {
    let code = QrCode::with_error_correction_level(text, EcLevel::L).ok()?;
    Some(QrMatrix {
        size: code.width(),
        dark: code
            .to_colors()
            .into_iter()
            .map(|c| c == Color::Dark)
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_short_url_makes_a_square_symbol() {
        let qr = qr_matrix("https://example.org/r/soup").expect("fits");
        assert_eq!(qr.dark.len(), qr.size * qr.size);
        assert!(qr.size >= 21 && qr.size % 4 == 1);
        assert!(qr.is_dark(0, 0), "the finder pattern starts dark");
    }

    #[test]
    fn the_path_covers_only_dark_runs() {
        let qr = QrMatrix {
            size: 3,
            dark: vec![true, true, false, false, false, false, true, false, true],
        };
        assert_eq!(
            qr.svg_path(10, 20, 2),
            "M10 20h4v2h-4zM10 24h2v2h-2zM14 24h2v2h-2z"
        );
    }

    #[test]
    fn oversized_text_is_refused() {
        assert!(qr_matrix(&"x".repeat(4000)).is_none());
    }
}
