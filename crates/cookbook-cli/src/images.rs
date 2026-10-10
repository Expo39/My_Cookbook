//! Recipe photos: each source is resized to a few widths and written as WebP and JPEG under `static/img/<id>/`.

use std::{
    collections::BTreeMap,
    fs,
    hash::{DefaultHasher, Hasher},
    io,
    path::Path,
};

use cookbook_core::{Collection, ImageMeta};
use image::{
    DynamicImage, ImageDecoder, ImageReader, RgbImage, codecs::jpeg::JpegEncoder, imageops,
    imageops::FilterType,
};
use serde::{Deserialize, Serialize};

use crate::build::BuildError;

/// The widths offered to `srcset`, smallest first.
pub const WIDTHS: [u32; 3] = [480, 960, 1600];
const JPEG_QUALITY: u8 = 82;
const WEBP_QUALITY: f32 = 78.0;
/// Bumped when the encoders or the sizes change, so existing output is rebuilt.
const PIPELINE: &str = "1";
const STATE_FILE: &str = ".state.json";

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct Entry {
    fingerprint: u64,
    width: u32,
    height: u32,
    widths: Vec<u32>,
}

type State = BTreeMap<String, Entry>;

fn fail(context: &str, error: impl std::fmt::Display) -> BuildError {
    BuildError::Other(format!("{context}: {error}"))
}

/// Widths to write for a source `width` pixels wide: the standard ones below it, then the source's own width up to the largest.
pub fn widths_for(width: u32) -> Vec<u32> {
    let own = width.min(WIDTHS[WIDTHS.len() - 1]);
    let mut widths: Vec<u32> = WIDTHS.iter().copied().filter(|&w| w < own).collect();
    widths.push(own);
    widths
}

/// Decodes a photo, honouring its EXIF orientation.
pub fn open(path: &Path) -> Result<DynamicImage, BuildError> {
    let reader = ImageReader::open(path)
        .map_err(|e| fail(&path.display().to_string(), e))?
        .with_guessed_format()
        .map_err(|e| fail(&path.display().to_string(), e))?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|e| fail(&path.display().to_string(), e))?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut image =
        DynamicImage::from_decoder(decoder).map_err(|e| fail(&path.display().to_string(), e))?;
    image.apply_orientation(orientation);
    Ok(image)
}

/// Alpha is flattened onto white, because neither output format is used with transparency.
fn flatten(image: &DynamicImage) -> RgbImage {
    if !image.color().has_alpha() {
        return image.to_rgb8();
    }
    let rgba = image.to_rgba8();
    let mut out = RgbImage::new(rgba.width(), rgba.height());
    for (target, source) in out.pixels_mut().zip(rgba.pixels()) {
        let alpha = u32::from(source[3]);
        for channel in 0..3 {
            let blended = (u32::from(source[channel]) * alpha + 255 * (255 - alpha) + 127) / 255;
            target[channel] = blended as u8;
        }
    }
    out
}

fn encode_jpeg(rgb: &RgbImage) -> Result<Vec<u8>, BuildError> {
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, JPEG_QUALITY)
        .encode_image(rgb)
        .map_err(|e| fail("encoding a JPEG", e))?;
    Ok(bytes)
}

fn encode_webp(rgb: &RgbImage) -> Vec<u8> {
    webp::Encoder::from_rgb(rgb.as_raw(), rgb.width(), rgb.height())
        .encode(WEBP_QUALITY)
        .to_vec()
}

fn hash_file(path: &Path, extra: &str) -> io::Result<u64> {
    let mut hasher = DefaultHasher::new();
    hasher.write(&fs::read(path)?);
    hasher.write(extra.as_bytes());
    Ok(hasher.finish())
}

fn write_widths(source: &Path, dir: &Path) -> Result<(u32, u32, Vec<u32>), BuildError> {
    let image = open(source)?;
    let (width, height) = (image.width(), image.height());
    let widths = widths_for(width);
    fs::create_dir_all(dir)?;
    let rgb = flatten(&image);
    let results: Vec<Result<(), BuildError>> = std::thread::scope(|scope| {
        let jobs: Vec<_> = widths
            .iter()
            .map(|&target| {
                let rgb = &rgb;
                scope.spawn(move || {
                    let resized = if target == width {
                        rgb.clone()
                    } else {
                        let scaled = u64::from(height) * u64::from(target) / u64::from(width);
                        imageops::resize(rgb, target, scaled.max(1) as u32, FilterType::Lanczos3)
                    };
                    fs::write(dir.join(format!("{target}.webp")), encode_webp(&resized))?;
                    fs::write(dir.join(format!("{target}.jpg")), encode_jpeg(&resized)?)?;
                    Ok(())
                })
            })
            .collect();
        jobs.into_iter()
            .map(|job| job.join().expect("an encoder thread does not panic"))
            .collect()
    });
    results.into_iter().collect::<Result<(), _>>()?;
    Ok((width, height, widths))
}

fn outputs_exist(dir: &Path, widths: &[u32]) -> bool {
    widths
        .iter()
        .all(|w| dir.join(format!("{w}.webp")).is_file() && dir.join(format!("{w}.jpg")).is_file())
}

/// Writes the resized photos for every recipe that has one and returns what was measured, keyed by recipe id.
/// Photos whose source is unchanged are skipped, and output for photos that are gone is removed.
pub fn process(
    root: &Path,
    out: &Path,
    collection: &Collection,
) -> Result<BTreeMap<String, ImageMeta>, BuildError> {
    let state_path = out.join(STATE_FILE);
    let old: State = fs::read(&state_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    let mut state = State::new();
    let mut metas = BTreeMap::new();

    for file in &collection.recipes {
        let Some(image) = &file.recipe.image else {
            continue;
        };
        let id = file.id();
        let folder = id.rsplit_once('/').map_or("", |(folder, _)| folder);
        let source = root.join(folder).join(&image.src);
        let dir = out.join(&id);
        let fingerprint = hash_file(&source, PIPELINE).map_err(|e| fail(&image.src, e))?;
        let entry = match old.get(&id) {
            Some(entry)
                if entry.fingerprint == fingerprint && outputs_exist(&dir, &entry.widths) =>
            {
                Entry {
                    fingerprint,
                    width: entry.width,
                    height: entry.height,
                    widths: entry.widths.clone(),
                }
            }
            _ => {
                let _ = fs::remove_dir_all(&dir);
                let (width, height, widths) = write_widths(&source, &dir)?;
                Entry {
                    fingerprint,
                    width,
                    height,
                    widths,
                }
            }
        };
        metas.insert(
            id.clone(),
            ImageMeta {
                width: entry.width,
                height: entry.height,
                widths: entry.widths.clone(),
            },
        );
        state.insert(id, entry);
    }

    for id in old.keys().filter(|id| !state.contains_key(*id)) {
        let _ = fs::remove_dir_all(out.join(id));
    }
    if state.is_empty() && !out.exists() {
        return Ok(metas);
    }
    fs::create_dir_all(out)?;
    fs::write(&state_path, serde_json::to_vec(&state)?)?;
    Ok(metas)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn widths_never_exceed_the_source() {
        assert_eq!(widths_for(3000), [480, 960, 1600]);
        assert_eq!(widths_for(1200), [480, 960, 1200]);
        assert_eq!(widths_for(960), [480, 960]);
        assert_eq!(widths_for(300), [300]);
    }

    #[test]
    fn transparency_flattens_to_white() {
        let mut rgba = image::RgbaImage::new(1, 1);
        rgba.put_pixel(0, 0, image::Rgba([0, 0, 0, 0]));
        let flat = flatten(&DynamicImage::ImageRgba8(rgba));
        assert_eq!(flat.get_pixel(0, 0).0, [255, 255, 255]);
    }
}
