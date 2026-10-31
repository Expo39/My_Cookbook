//! The card design as a list of drawing operations. The numbers live in `assets/card-layout.json`, and
//! `web/src/lib/card/layout.ts` composes the same operations for the canvas.

use std::collections::BTreeMap;

use cookbook_core::QrMatrix;
use serde::Deserialize;

use super::text::{Face, Measure, ellipsize, fit_lines, wrap};

pub const LAYOUT_JSON: &str = include_str!("../../../../assets/card-layout.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    pub surface: String,
    pub ink: String,
    pub muted: String,
    pub primary: String,
    pub on_primary: String,
    pub bg: String,
}

#[derive(Debug, Deserialize)]
pub struct FontSpec {
    pub family: String,
    pub weight: u32,
}

#[derive(Debug, Deserialize)]
pub struct Fonts {
    pub display: FontSpec,
    pub body: FontSpec,
    #[serde(rename = "bodyBold")]
    pub body_bold: FontSpec,
    pub num: FontSpec,
}

impl Fonts {
    pub fn spec(&self, face: Face) -> &FontSpec {
        match face {
            Face::Display => &self.display,
            Face::Body => &self.body,
            Face::BodyBold => &self.body_bold,
            Face::Num => &self.num,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Format {
    pub kind: String,
    pub width: f64,
    pub height: f64,
    pub photo_share: f64,
    pub safe_top: f64,
    pub safe_bottom: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sheet {
    pub design_width: f64,
    pub margin: f64,
    pub pad: f64,
    pub label_size: f64,
    pub label_gap: f64,
    pub title_sizes: Vec<f64>,
    pub title_lines: usize,
    pub leading: f64,
    pub local_size: f64,
    pub local_gap: f64,
    pub body_gap: f64,
    pub meta_gap: f64,
    pub meta_size: f64,
    pub list_label_size: f64,
    pub list_gap: f64,
    pub line_size: f64,
    pub line_step: f64,
    pub amount_column: f64,
    pub amount_gap: f64,
    /// How far the ingredient lines may shrink so that every one fits on the card.
    pub min_line_scale: f64,
    /// How much of the amount column a line keeps when the list runs in two columns.
    pub paired_amount_share: f64,
    pub footer_gap: f64,
    pub qr_box: f64,
    pub qr_quiet: f64,
    pub wordmark_size: f64,
    pub note_size: f64,
    pub note_step: f64,
    pub glyph_gap: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Banner {
    pub design_width: f64,
    pub margin: f64,
    pub pad: f64,
    pub label_size: f64,
    pub label_gap: f64,
    pub title_sizes: Vec<f64>,
    /// Smaller sizes, so the title block leaves room for the photo above it.
    pub photo_title_sizes: Vec<f64>,
    pub title_lines: usize,
    pub leading: f64,
    pub local_size: f64,
    pub local_gap: f64,
    pub meta_gap: f64,
    pub meta_size: f64,
    pub wordmark_size: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub glyphs: Glyphs,
    pub palette: Palette,
    pub fonts: Fonts,
    pub formats: BTreeMap<String, Format>,
    pub sheet: Sheet,
    pub banner: Banner,
    pub ascent: f64,
    pub label_leading: f64,
    pub text_leading: f64,
    pub wordmark: String,
    pub qr_note: String,
}

/// Icons drawn as strokes in a 24 by 24 box.
#[derive(Debug, Deserialize)]
pub struct Glyphs {
    pub instagram: Vec<String>,
    pub stroke: f64,
}

impl Layout {
    pub fn load() -> Layout {
        serde_json::from_str(LAYOUT_JSON).expect("assets/card-layout.json is valid")
    }
}

/// One ingredient line: the amount sits in its own column in the numeral face.
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub amount: String,
    pub rest: String,
}

pub struct Content {
    pub label: String,
    pub title: String,
    pub title_local: Option<String>,
    pub total: Option<String>,
    pub serves: String,
    pub ingredients: Vec<Line>,
    pub qr: Option<QrMatrix>,
    pub url_text: String,
    pub has_photo: bool,
    /// "@handle", when the site shows its Instagram account.
    pub instagram: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Op {
    Rect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        fill: String,
        opacity: f64,
    },
    Photo {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    },
    Text {
        x: f64,
        y: f64,
        text: String,
        face: Face,
        size: f64,
        fill: String,
        end: bool,
    },
    Glyph {
        x: f64,
        y: f64,
        size: f64,
        stroke: String,
    },
    Qr {
        x: i32,
        y: i32,
        module: i32,
        fill: String,
    },
}

struct Pen<'a> {
    ops: Vec<Op>,
    layout: &'a Layout,
}

impl Pen<'_> {
    /// The baseline of a line of `size` set in a box of `leading` times its size that starts at `top`.
    fn baseline(&self, top: f64, size: f64, leading: f64) -> f64 {
        top + size * ((leading - 1.0) / 2.0 + self.layout.ascent)
    }

    fn rect(&mut self, x: f64, y: f64, w: f64, h: f64, fill: &str, opacity: f64) {
        self.ops.push(Op::Rect {
            x,
            y,
            w,
            h,
            fill: fill.to_owned(),
            opacity,
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn text(
        &mut self,
        x: f64,
        top: f64,
        leading: f64,
        text: &str,
        face: Face,
        size: f64,
        fill: &str,
        end: bool,
    ) {
        let y = self.baseline(top, size, leading);
        self.ops.push(Op::Text {
            x,
            y,
            text: text.to_owned(),
            face,
            size,
            fill: fill.to_owned(),
            end,
        });
    }
}

fn scaled(sizes: &[f64], u: f64) -> Vec<f64> {
    sizes.iter().map(|s| s * u).collect()
}

/// The operations for one card, in painting order.
pub fn compose(
    layout: &Layout,
    format: &Format,
    content: &Content,
    measure: &dyn Measure,
) -> Vec<Op> {
    let mut pen = Pen {
        ops: Vec::new(),
        layout,
    };
    if format.kind == "banner" {
        banner(&mut pen, format, content, measure);
    } else {
        sheet(&mut pen, format, content, measure);
    }
    pen.ops
}

/// "1 h 55 min  |  5 servings", leaving out the time when the recipe has none.
fn meta_line(content: &Content) -> String {
    [content.total.clone(), Some(content.serves.clone())]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("  |  ")
}

fn banner(pen: &mut Pen, format: &Format, content: &Content, measure: &dyn Measure) {
    let layout = pen.layout;
    let (b, p) = (&layout.banner, &layout.palette);
    let u = format.width / b.design_width;
    let (w, h) = (format.width, format.height);
    let (margin, pad) = (b.margin * u, b.pad * u);
    let inner = w - 2.0 * margin;
    let label_size = b.label_size * u;
    let label = ellipsize(
        measure,
        Face::BodyBold,
        label_size,
        &content.label.to_uppercase(),
        inner,
    );
    let (title_size, title_lines) = fit_lines(
        measure,
        Face::Display,
        &scaled(
            if content.has_photo {
                &b.photo_title_sizes
            } else {
                &b.title_sizes
            },
            u,
        ),
        &content.title,
        inner,
        b.title_lines,
    );
    let local_size = b.local_size * u;
    let meta_size = b.meta_size * u;
    let meta = meta_line(content);

    let label_h = label_size * layout.label_leading;
    let title_h = title_lines.len() as f64 * title_size * b.leading;
    let local_h = content
        .title_local
        .as_ref()
        .map_or(0.0, |_| b.local_gap * u + local_size * layout.text_leading);
    let meta_h = meta_size * layout.text_leading;
    let content_h = label_h + b.label_gap * u + title_h + local_h + b.meta_gap * u + meta_h;

    let top = if content.has_photo {
        let block_h = pad + content_h + pad;
        let block_y = h - block_h;
        pen.ops.push(Op::Photo {
            x: 0.0,
            y: 0.0,
            w,
            h: block_y,
        });
        pen.rect(0.0, block_y, w, block_h, &p.ink, 1.0);
        block_y + pad
    } else {
        pen.rect(0.0, 0.0, w, h, &p.primary, 1.0);
        (h - content_h) / 2.0
    };

    let on = p.on_primary.as_str();
    let mut y = top;
    pen.text(
        margin,
        y,
        layout.label_leading,
        &label,
        Face::BodyBold,
        label_size,
        on,
        false,
    );
    y += label_h + b.label_gap * u;
    for line in &title_lines {
        pen.text(
            margin,
            y,
            b.leading,
            line,
            Face::Display,
            title_size,
            on,
            false,
        );
        y += title_size * b.leading;
    }
    if let Some(local) = &content.title_local {
        y += b.local_gap * u;
        let local = ellipsize(measure, Face::Body, local_size, local, inner);
        pen.text(
            margin,
            y,
            layout.text_leading,
            &local,
            Face::Body,
            local_size,
            on,
            false,
        );
        y += local_size * layout.text_leading;
    }
    y += b.meta_gap * u;
    pen.text(
        margin,
        y,
        layout.text_leading,
        &meta,
        Face::Num,
        meta_size,
        on,
        false,
    );
    pen.text(
        w - margin,
        y,
        layout.text_leading,
        &layout.wordmark,
        Face::Display,
        b.wordmark_size * u,
        on,
        true,
    );
}

struct Placed {
    amount: String,
    parts: Vec<String>,
    column: usize,
    row: usize,
}

struct ListPlan {
    size: f64,
    step: f64,
    gap: f64,
    column_gap: f64,
    column_width: f64,
    amount_width: f64,
    placed: Vec<Placed>,
    more: usize,
    more_at: (usize, usize),
}

/// Where each ingredient goes on a sheet, shown in full: a long one wraps under itself, and an
/// amount too wide for its column joins the words. The lines shrink a step at a time to a size that
/// still reads, then the list runs in two balanced columns, keeping each ingredient's lines
/// together. Only a list too long even for that ends in "+ N more".
fn plan_list(
    s: &Sheet,
    lines: &[Line],
    space: f64,
    width: f64,
    u: f64,
    measure: &dyn Measure,
) -> ListPlan {
    let column_gap = 2.0 * s.amount_gap * u;
    let attempt = |columns: usize, scale: f64, partial: bool| -> Option<ListPlan> {
        let size = s.line_size * u * scale;
        let step = s.line_step * u * scale;
        let gap = s.amount_gap * u * scale;
        let column_width = (width - (columns - 1) as f64 * column_gap) / columns as f64;
        let share = if columns == 2 {
            s.paired_amount_share
        } else {
            1.0
        };
        let amount_width = s.amount_column * u * scale * share;
        let items: Vec<(String, Vec<String>)> = lines
            .iter()
            .map(|line| {
                let fits = measure.width(Face::Num, size, &line.amount) <= amount_width;
                let rest = if fits || line.amount.is_empty() {
                    line.rest.clone()
                } else {
                    format!("{} {}", line.amount, line.rest)
                };
                let amount = if fits {
                    line.amount.clone()
                } else {
                    String::new()
                };
                let parts = wrap(
                    measure,
                    Face::Body,
                    size,
                    &rest,
                    column_width - amount_width - gap,
                );
                (amount, parts)
            })
            .collect();
        let rows = if space > 0.0 {
            (space / step).floor() as usize
        } else {
            0
        };
        let total: usize = items.iter().map(|(_, parts)| parts.len()).sum();
        let target = rows.min(total.div_ceil(columns));
        let mut placed: Vec<Placed> = Vec::new();
        let (mut column, mut row) = (0, 0);
        for (amount, parts) in &items {
            let height = parts.len();
            if row > 0 && row + height > target && column < columns - 1 {
                column += 1;
                row = 0;
            }
            if row + height > rows {
                if !partial {
                    return None;
                }
                break;
            }
            placed.push(Placed {
                amount: amount.clone(),
                parts: parts.clone(),
                column,
                row,
            });
            row += height;
        }
        // A cut list keeps a line free for "+ N more".
        while placed.len() < items.len() && row >= rows {
            let Some(last) = placed.pop() else { break };
            (column, row) = (last.column, last.row);
        }
        Some(ListPlan {
            size,
            step,
            gap,
            column_gap,
            column_width,
            amount_width,
            more: items.len() - placed.len(),
            placed,
            more_at: (column, row),
        })
    };
    for columns in [1, 2] {
        let mut scale = 1.0;
        while scale >= s.min_line_scale - 1e-9 {
            if let Some(plan) = attempt(columns, scale, false) {
                return plan;
            }
            scale -= 0.05;
        }
    }
    attempt(2, s.min_line_scale, true).expect("a partial plan always exists")
}

fn sheet(pen: &mut Pen, format: &Format, content: &Content, measure: &dyn Measure) {
    let layout = pen.layout;
    let (s, p) = (&layout.sheet, &layout.palette);
    let u = format.width / s.design_width;
    let (w, h) = (format.width, format.height);
    let (margin, pad) = (s.margin * u, s.pad * u);
    let inner = w - 2.0 * margin;

    let label_size = s.label_size * u;
    let label = ellipsize(
        measure,
        Face::BodyBold,
        label_size,
        &content.label.to_uppercase(),
        inner,
    );
    let (title_size, title_lines) = fit_lines(
        measure,
        Face::Display,
        &scaled(&s.title_sizes, u),
        &content.title,
        inner,
        s.title_lines,
    );
    let local_size = s.local_size * u;
    let meta_size = s.meta_size * u;
    let meta = meta_line(content);

    let label_h = label_size * layout.label_leading;
    let title_h = title_lines.len() as f64 * title_size * s.leading;
    let local_h = content
        .title_local
        .as_ref()
        .map_or(0.0, |_| s.local_gap * u + local_size * layout.text_leading);
    let content_h = label_h
        + s.label_gap * u
        + title_h
        + local_h
        + s.meta_gap * u
        + meta_size * layout.text_leading;

    let (header_bottom, text_top) = if content.has_photo {
        let block_h = pad + content_h + pad;
        let photo_h = (format.photo_share * h).round();
        pen.ops.push(Op::Photo {
            x: 0.0,
            y: 0.0,
            w,
            h: photo_h,
        });
        pen.rect(0.0, photo_h, w, block_h, &p.ink, 1.0);
        (photo_h + block_h, photo_h + pad)
    } else {
        let top = format.safe_top.max(pad);
        let block_h = top + content_h + pad;
        pen.rect(0.0, 0.0, w, block_h, &p.primary, 1.0);
        (block_h, top)
    };

    let on = p.on_primary.as_str();
    let mut y = text_top;
    pen.text(
        margin,
        y,
        layout.label_leading,
        &label,
        Face::BodyBold,
        label_size,
        on,
        false,
    );
    y += label_h + s.label_gap * u;
    for line in &title_lines {
        pen.text(
            margin,
            y,
            s.leading,
            line,
            Face::Display,
            title_size,
            on,
            false,
        );
        y += title_size * s.leading;
    }
    if let Some(local) = &content.title_local {
        y += s.local_gap * u;
        let local = ellipsize(measure, Face::Body, local_size, local, inner);
        pen.text(
            margin,
            y,
            layout.text_leading,
            &local,
            Face::Body,
            local_size,
            on,
            false,
        );
        y += local_size * layout.text_leading;
    }
    y += s.meta_gap * u;
    pen.text(
        margin,
        y,
        layout.text_leading,
        &meta,
        Face::Num,
        meta_size,
        on,
        false,
    );

    let mut cursor = header_bottom + s.body_gap * u;
    let list_label = s.list_label_size * u;
    pen.text(
        margin,
        cursor,
        layout.label_leading,
        "INGREDIENTS",
        Face::BodyBold,
        list_label,
        &p.primary,
        false,
    );
    cursor += list_label * layout.label_leading + s.list_gap * u;

    let qr_box = (s.qr_box * u).round();
    let qr_x = (w - margin - qr_box).round();
    let qr_y = (h - format.safe_bottom - margin - qr_box).round();
    let space = qr_y - s.footer_gap * u - cursor;
    let list = plan_list(s, &content.ingredients, space, w - 2.0 * margin, u, measure);
    let leading = list.step / list.size;
    let slot = |column: usize| {
        let amount_right =
            margin + column as f64 * (list.column_width + list.column_gap) + list.amount_width;
        (amount_right, amount_right + list.gap)
    };
    for item in &list.placed {
        let (amount_right, rest_x) = slot(item.column);
        for (k, part) in item.parts.iter().enumerate() {
            let top = cursor + (item.row + k) as f64 * list.step;
            if k == 0 && !item.amount.is_empty() {
                pen.text(
                    amount_right,
                    top,
                    leading,
                    &item.amount,
                    Face::Num,
                    list.size,
                    &p.ink,
                    true,
                );
            }
            pen.text(
                rest_x,
                top,
                leading,
                part,
                Face::Body,
                list.size,
                &p.ink,
                false,
            );
        }
    }
    if list.more > 0 {
        let (_, rest_x) = slot(list.more_at.0);
        let top = cursor + list.more_at.1 as f64 * list.step;
        pen.text(
            rest_x,
            top,
            leading,
            &format!("+ {} more", list.more),
            Face::Body,
            list.size,
            &p.muted,
            false,
        );
    }

    if let Some(qr) = &content.qr {
        pen.rect(qr_x, qr_y, qr_box, qr_box, &p.surface, 1.0);
        let quiet = s.qr_quiet * u;
        let module = (((qr_box - 2.0 * quiet) / qr.size as f64).floor() as i32).max(1);
        let drawn = f64::from(module) * qr.size as f64;
        let offset = ((qr_box - drawn) / 2.0).floor();
        pen.ops.push(Op::Qr {
            x: (qr_x + offset) as i32,
            y: (qr_y + offset) as i32,
            module,
            fill: p.ink.clone(),
        });
    }

    let wordmark = s.wordmark_size * u;
    let note = s.note_size * u;
    let note_step = s.note_step * u;
    let lines = if content.instagram.is_some() {
        3.0
    } else {
        2.0
    };
    let stack_h = wordmark * layout.label_leading + lines * note_step;
    let mut y = qr_y + (qr_box - stack_h) / 2.0;
    let left_width = qr_x - margin - s.footer_gap * u;
    let mark = ellipsize(
        measure,
        Face::Display,
        wordmark,
        &layout.wordmark,
        left_width,
    );
    pen.text(
        margin,
        y,
        layout.label_leading,
        &mark,
        Face::Display,
        wordmark,
        &p.primary,
        false,
    );
    y += wordmark * layout.label_leading;
    let hint = ellipsize(measure, Face::Body, note, &layout.qr_note, left_width);
    pen.text(
        margin,
        y,
        note_step / note,
        &hint,
        Face::Body,
        note,
        &p.muted,
        false,
    );
    y += note_step;
    let url = ellipsize(measure, Face::Body, note, &content.url_text, left_width);
    pen.text(
        margin,
        y,
        note_step / note,
        &url,
        Face::Body,
        note,
        &p.muted,
        false,
    );
    if let Some(handle) = &content.instagram {
        y += note_step;
        let glyph = note;
        let gap = s.glyph_gap * u;
        pen.ops.push(Op::Glyph {
            x: margin,
            y: y + (note_step - glyph) / 2.0,
            size: glyph,
            stroke: p.muted.clone(),
        });
        let handle = ellipsize(measure, Face::Body, note, handle, left_width - glyph - gap);
        pen.text(
            margin + glyph + gap,
            y,
            note_step / note,
            &handle,
            Face::Body,
            note,
            &p.muted,
            false,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::text::Metrics;

    fn sheet_texts(ingredients: Vec<Line>) -> Vec<String> {
        let layout = Layout::load();
        let content = Content {
            label: "Main courses / Rice bowls".to_owned(),
            title: "Chicken Katsu Curry".to_owned(),
            title_local: None,
            total: Some("50 min".to_owned()),
            serves: "2 servings".to_owned(),
            ingredients,
            qr: None,
            url_text: "example.test".to_owned(),
            has_photo: false,
            instagram: None,
        };
        compose(
            &layout,
            &layout.formats["portrait"],
            &content,
            &Metrics::load(),
        )
        .into_iter()
        .filter_map(|op| match op {
            Op::Text { text, .. } => Some(text),
            _ => None,
        })
        .collect()
    }

    fn line(amount: &str, rest: &str) -> Line {
        Line {
            amount: amount.to_owned(),
            rest: rest.to_owned(),
        }
    }

    #[test]
    fn a_long_ingredient_wraps_instead_of_being_cut_short() {
        let long =
            "Japanese short-grain or jasmine rice, uncooked, about 80 g per person, rinsed well";
        let texts = sheet_texts(vec![line("160 g", long)]);
        let parts: Vec<&String> = texts.iter().filter(|t| long.contains(t.as_str())).collect();
        assert!(parts.len() > 1, "{texts:?}");
        assert_eq!(
            parts
                .iter()
                .map(|t| t.as_str())
                .collect::<Vec<_>>()
                .join(" "),
            long
        );
        assert!(!texts.iter().any(|t| t.ends_with("...")));
    }

    #[test]
    fn a_long_list_is_shown_whole_in_two_columns() {
        let list = (1..=24)
            .map(|i| line(&format!("{i} g"), &format!("item {i}")))
            .collect();
        let texts = sheet_texts(list);
        for i in 1..=24 {
            assert!(texts.contains(&format!("item {i}")), "item {i} is missing");
        }
        assert!(
            !texts
                .iter()
                .any(|t| t.ends_with("more") || t.ends_with("..."))
        );
    }
}
