use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
        .join("recipes")
}

fn scratch(name: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&dir);
    dir
}

fn build(root: &Path, out: &Path, images: &Path) -> (i32, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_cookbook-cli"))
        .arg("--root")
        .arg(root)
        .args(["build", "--out"])
        .arg(out)
        .arg("--images-out")
        .arg(images)
        .output()
        .expect("the binary runs");
    (
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    )
}

#[test]
fn photos_are_resized_and_measured() {
    let (out, images) = (scratch("photos-data"), scratch("photos-img"));
    let (code, stderr) = build(&fixture("photo"), &out, &images);
    assert_eq!(code, 0, "{stderr}");

    let dir = images.join("mains/lentil-soup");
    for width in [480_u32, 960, 1600] {
        let jpeg = dir.join(format!("{width}.jpg"));
        let size = image::image_dimensions(&jpeg).unwrap();
        assert_eq!(size, (width, width * 1067 / 1600), "{width}");
        let webp = fs::read(dir.join(format!("{width}.webp"))).unwrap();
        assert_eq!((&webp[..4], &webp[8..12]), (&b"RIFF"[..], &b"WEBP"[..]));
        assert!(webp.len() < fs::metadata(&jpeg).unwrap().len() as usize * 2);
    }

    let index: serde_json::Value =
        serde_json::from_slice(&fs::read(out.join("index.json")).unwrap()).unwrap();
    let image = &index["sections"][0]["recipes"][0]["image"];
    assert_eq!(image["src"], "mains/lentil-soup.jpg");
    assert_eq!(
        (image["width"].as_u64(), image["height"].as_u64()),
        (Some(1600), Some(1067))
    );
    assert_eq!(image["widths"], serde_json::json!([480, 960, 1600]));
}

#[test]
fn unchanged_photos_are_not_encoded_again() {
    let (out, images) = (scratch("photos-skip-data"), scratch("photos-skip-img"));
    build(&fixture("photo"), &out, &images);
    let marker = images.join("mains/lentil-soup/960.webp");
    let first = fs::metadata(&marker).unwrap().modified().unwrap();
    let (code, _) = build(&fixture("photo"), &out, &images);
    assert_eq!(code, 0);
    assert_eq!(fs::metadata(&marker).unwrap().modified().unwrap(), first);

    fs::remove_file(&marker).unwrap();
    build(&fixture("photo"), &out, &images);
    assert!(marker.is_file(), "a missing output is made again");
}

#[test]
fn recipes_without_photos_write_no_image_folder() {
    let (out, images) = (scratch("nophoto-data"), scratch("nophoto-img"));
    let (code, stderr) = build(&fixture("valid"), &out, &images);
    assert_eq!(code, 0, "{stderr}");
    assert!(!images.exists());
}
