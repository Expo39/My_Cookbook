//! Share cards rendered at build time: an Open Graph image, a portrait post and a story for every recipe.

mod layout;
mod svg;
mod text;

use std::{
    collections::BTreeMap,
    fs,
    hash::{DefaultHasher, Hasher},
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, Instant},
};

use base64::{Engine, engine::general_purpose::STANDARD};
use cookbook_core::{
    RecipeCard, RecipeData, RecipeFile, build_site, format_minutes, qr_matrix, servings_label,
};
use image::{DynamicImage, codecs::jpeg::JpegEncoder, imageops::FilterType};
use layout::{Content, Layout, Line, Op, compose};
use resvg::{tiny_skia, usvg};
use serde::Deserialize;
use text::{Face, Metrics};

use crate::{build::BuildError, images};

/// The cards written for every recipe, as file stems.
pub const FORMATS: [&str; 3] = ["og", "portrait", "story"];
/// Bumped when the rendering code changes in a way the inputs do not show.
const RENDERER: &str = "1";
const STATE_FILE: &str = ".state.json";
const SITE_JSON: &str = include_str!("../../../../site.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SiteConfig {
    url: String,
    base_path: String,
}

/// The deployed address cards link to: `PUBLIC_SITE_URL` with `BASE_PATH`, or the defaults in `site.json`.
pub fn site_root() -> String {
    let config: SiteConfig = serde_json::from_str(SITE_JSON).expect("site.json is valid");
    let (url, base) = match std::env::var("PUBLIC_SITE_URL") {
        Ok(url) if !url.is_empty() => (url, std::env::var("BASE_PATH").unwrap_or_default()),
        _ => (config.url, config.base_path),
    };
    format!(
        "{}{}",
        url.trim_end_matches('/'),
        base.trim_end_matches('/')
    )
}

#[derive(Debug, Default)]
pub struct Summary {
    pub rendered: usize,
    pub skipped: usize,
    pub removed: usize,
    pub elapsed: Duration,
}

struct Job<'a> {
    id: &'a str,
    data: &'a RecipeData,
    card: &'a RecipeCard,
    photo_path: Option<std::path::PathBuf>,
}

fn hash_all(parts: &[&[u8]]) -> u64 {
    let mut hasher = DefaultHasher::new();
    for part in parts {
        hasher.write_usize(part.len());
        hasher.write(part);
    }
    hasher.finish()
}

fn split_amount(item: &cookbook_core::ScaledIngredient) -> Line {
    let amount = item.amount.as_ref().map_or("", |a| a.text.as_str());
    match item.text.strip_prefix(amount) {
        Some(rest) if !amount.is_empty() => Line {
            amount: amount.to_owned(),
            rest: rest.trim_start().to_owned(),
        },
        _ => Line {
            amount: String::new(),
            rest: item.text.clone(),
        },
    }
}

fn content(
    data: &RecipeData,
    card: &RecipeCard,
    url: &str,
    short: &str,
    has_photo: bool,
) -> Content {
    let recipe = &data.recipe;
    Content {
        label: data.section.join(" / "),
        title: recipe.title.clone(),
        title_local: recipe.title_local.clone(),
        total: card.times.total.map(|t| format_minutes(f64::from(t), None)),
        serves: servings_label(f64::from(recipe.servings), recipe.servings_noun.as_ref()),
        ingredients: data
            .view
            .groups
            .iter()
            .flat_map(|group| group.items.iter().map(split_amount))
            .collect(),
        qr: qr_matrix(url),
        url_text: short.to_owned(),
        has_photo,
    }
}

fn data_uri(photo: &DynamicImage, width: u32, height: u32) -> Result<String, String> {
    let cropped = photo
        .resize_to_fill(width, height, FilterType::CatmullRom)
        .to_rgb8();
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, 88)
        .encode_image(&cropped)
        .map_err(|e| e.to_string())?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)))
}

/// Photos beyond the widest card are shrunk once, so each format crops from a smaller image.
fn downscale(image: DynamicImage) -> DynamicImage {
    if image.width() > 2400 {
        image.resize(2400, 2400, FilterType::Triangle)
    } else {
        image
    }
}

fn options() -> usvg::Options<'static> {
    let mut options = usvg::Options::default();
    let database = options.fontdb_mut();
    for face in Face::ALL {
        database.load_font_data(face.font_data().to_vec());
    }
    options
}

/// Renders one card to PNG bytes.
fn render(
    layout: &Layout,
    metrics: &Metrics,
    options: &usvg::Options,
    format: &layout::Format,
    content: &Content,
    photo: Option<&DynamicImage>,
) -> Result<Vec<u8>, String> {
    let ops = compose(layout, format, content, metrics);
    let uri = match (
        photo,
        ops.iter().find_map(|op| match op {
            Op::Photo { w, h, .. } => Some((*w, *h)),
            _ => None,
        }),
    ) {
        (Some(photo), Some((w, h))) => Some(data_uri(photo, w.round() as u32, h.round() as u32)?),
        _ => None,
    };
    let svg = svg::to_svg(
        layout,
        &ops,
        (format.width, format.height),
        uri.as_deref(),
        content.qr.as_ref(),
    );
    let tree = usvg::Tree::from_str(&svg, options).map_err(|e| e.to_string())?;
    let mut pixmap = tiny_skia::Pixmap::new(format.width as u32, format.height as u32)
        .ok_or("the card has no size")?;
    resvg::render(
        &tree,
        tiny_skia::Transform::identity(),
        &mut pixmap.as_mut(),
    );
    pixmap.encode_png().map_err(|e| e.to_string())
}

fn render_job(
    layout: &Layout,
    metrics: &Metrics,
    options: &usvg::Options,
    job: &Job,
    root_url: &str,
    out: &Path,
) -> Result<(), BuildError> {
    let url = format!("{root_url}/{}", job.id);
    let short = root_url
        .split_once("://")
        .map_or(root_url, |(_, rest)| rest);
    let photo = job
        .photo_path
        .as_ref()
        .map(|path| images::open(path).map(downscale))
        .transpose()?;
    let content = content(job.data, job.card, &url, short, photo.is_some());
    for name in FORMATS {
        let format = &layout.formats[name];
        let png = render(layout, metrics, options, format, &content, photo.as_ref())
            .map_err(|e| BuildError::Other(format!("card {}/{name}: {e}", job.id)))?;
        let path = out.join(job.id).join(format!("{name}.png"));
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, png)?;
    }
    Ok(())
}

/// Renders the cards that are missing or out of date and removes those of recipes that are gone.
pub fn run(root: &Path, out: &Path, site_root: &str) -> Result<Summary, BuildError> {
    let started = Instant::now();
    let (loaded, _) = crate::build::load_checked(root)?;
    let site = build_site(&loaded.collection);
    let layout = Layout::load();
    let metrics = Metrics::load();

    let state_path = out.join(STATE_FILE);
    let old: BTreeMap<String, u64> = fs::read(&state_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();

    let fonts: Vec<&[u8]> = Face::ALL.iter().map(|f| f.font_data()).collect();
    let mut base: Vec<&[u8]> = vec![
        layout::LAYOUT_JSON.as_bytes(),
        site_root.as_bytes(),
        RENDERER.as_bytes(),
    ];
    base.extend(fonts);
    let base = hash_all(&base);

    let cards: BTreeMap<&str, &RecipeCard> = site
        .index
        .sections
        .iter()
        .flat_map(flatten)
        .map(|card| (card.id.as_str(), card))
        .collect();
    let files: BTreeMap<String, &RecipeFile> = loaded
        .collection
        .recipes
        .iter()
        .map(|f| (f.id(), f))
        .collect();

    let mut state = BTreeMap::new();
    let mut todo = Vec::new();
    let mut summary = Summary::default();
    for (id, data) in &site.recipes {
        let card = cards[id.as_str()];
        let photo_path = files[id].recipe.image.as_ref().map(|image| {
            let folder = id.rsplit_once('/').map_or("", |(folder, _)| folder);
            root.join(folder).join(&image.src)
        });
        let photo_bytes = photo_path
            .as_ref()
            .map(fs::read)
            .transpose()?
            .unwrap_or_default();
        let json = serde_json::to_vec(data)?;
        let fingerprint = hash_all(&[&base.to_le_bytes(), id.as_bytes(), &json, &photo_bytes]);
        let present = FORMATS
            .iter()
            .all(|name| out.join(id).join(format!("{name}.png")).is_file());
        state.insert(id.clone(), fingerprint);
        if present && old.get(id) == Some(&fingerprint) {
            summary.skipped += 1;
        } else {
            todo.push(Job {
                id,
                data,
                card,
                photo_path,
            });
        }
    }

    let next = AtomicUsize::new(0);
    let workers = std::thread::available_parallelism()
        .map_or(2, usize::from)
        .min(todo.len().max(1));
    let results: Vec<Result<(), BuildError>> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..workers)
            .map(|_| {
                scope.spawn(|| {
                    let options = options();
                    let mut results = Vec::new();
                    loop {
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(job) = todo.get(index) else { break };
                        results.push(render_job(&layout, &metrics, &options, job, site_root, out));
                    }
                    results
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|h| h.join().expect("a card worker does not panic"))
            .collect()
    });
    results.into_iter().collect::<Result<(), _>>()?;
    summary.rendered = todo.len();

    for id in old.keys().filter(|id| !state.contains_key(*id)) {
        let _ = fs::remove_dir_all(out.join(id));
        summary.removed += 1;
    }
    fs::create_dir_all(out)?;
    fs::write(&state_path, serde_json::to_vec(&state)?)?;
    summary.elapsed = started.elapsed();
    Ok(summary)
}

fn flatten(node: &cookbook_core::SectionNode) -> Vec<&RecipeCard> {
    let mut cards: Vec<&RecipeCard> = node.recipes.iter().collect();
    for child in &node.sections {
        cards.extend(flatten(child));
    }
    cards
}
