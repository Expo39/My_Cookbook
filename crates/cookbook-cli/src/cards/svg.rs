use cookbook_core::QrMatrix;

use super::layout::{Layout, Op};

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn number(value: f64) -> String {
    let text = format!("{value:.2}");
    text.trim_end_matches('0').trim_end_matches('.').to_owned()
}

/// The SVG for a composed card. `photo` is a data URI already cropped to the photo operation's size.
pub fn to_svg(
    layout: &Layout,
    ops: &[Op],
    (width, height): (f64, f64),
    photo: Option<&str>,
    qr: Option<&QrMatrix>,
) -> String {
    let mut svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="{bg}"/>"#,
        w = number(width),
        h = number(height),
        bg = layout.palette.bg,
    );
    for op in ops {
        match op {
            Op::Rect {
                x,
                y,
                w,
                h,
                fill,
                opacity,
            } => svg.push_str(&format!(
                r#"<rect x="{}" y="{}" width="{}" height="{}" fill="{fill}" fill-opacity="{}"/>"#,
                number(*x),
                number(*y),
                number(*w),
                number(*h),
                number(*opacity),
            )),
            Op::Photo { x, y, w, h } => {
                if let Some(uri) = photo {
                    svg.push_str(&format!(
                        r#"<image x="{}" y="{}" width="{}" height="{}" preserveAspectRatio="none" href="{uri}"/>"#,
                        number(*x),
                        number(*y),
                        number(*w),
                        number(*h),
                    ));
                }
            }
            Op::Text {
                x,
                y,
                text,
                face,
                size,
                fill,
                end,
            } => {
                let font = layout.fonts.spec(*face);
                svg.push_str(&format!(
                    r#"<text x="{}" y="{}" font-family="{}" font-weight="{}" font-size="{}" fill="{fill}"{}>{}</text>"#,
                    number(*x),
                    number(*y),
                    font.family,
                    font.weight,
                    number(*size),
                    if *end { r#" text-anchor="end""# } else { "" },
                    escape(text),
                ));
            }
            Op::Glyph { x, y, size, stroke } => {
                svg.push_str(&format!(
                    r#"<g transform="translate({} {}) scale({})" fill="none" stroke="{stroke}" stroke-width="{}" stroke-linecap="round" stroke-linejoin="round">"#,
                    number(*x),
                    number(*y),
                    number(*size / 24.0),
                    layout.glyphs.stroke,
                ));
                for d in &layout.glyphs.instagram {
                    svg.push_str(&format!(r#"<path d="{d}"/>"#));
                }
                svg.push_str("</g>");
            }
            Op::Qr { x, y, module, fill } => {
                if let Some(qr) = qr {
                    svg.push_str(&format!(
                        r#"<path d="{}" fill="{fill}" shape-rendering="crispEdges"/>"#,
                        qr.svg_path(*x, *y, *module),
                    ));
                }
            }
        }
    }
    svg.push_str("</svg>");
    svg
}
