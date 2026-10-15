use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

const ROOT_URL: &str = "https://example.org/cookbook";
const ID: &str = "mains/lentil-soup";

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/photo/recipes")
}

fn scratch(name: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// A writable copy of the photo fixture with a small generated photo, so a test can edit it and stay quick.
fn copy_fixture(name: &str, shade: u8) -> PathBuf {
    let root = scratch(name).join("recipes");
    fs::create_dir_all(root.join("mains")).unwrap();
    for file in ["mains/_section.json", "mains/lentil-soup.json"] {
        fs::copy(fixture().join(file), root.join(file)).unwrap();
    }
    let recipe = root.join("mains/lentil-soup.json");
    let text = fs::read_to_string(&recipe).unwrap();
    fs::write(&recipe, text.replace("lentil-soup.jpg", "lentil-soup.png")).unwrap();
    write_photo(&root, shade);
    root
}

fn write_photo(root: &Path, shade: u8) {
    image::RgbImage::from_fn(240, 160, |x, y| {
        image::Rgb([shade, (x % 256) as u8, (y % 256) as u8])
    })
    .save(root.join("mains/lentil-soup.png"))
    .unwrap();
}

fn cards(root: &Path, out: &Path) -> String {
    cards_with(root, out, Path::new("no-such-config.json"))
}

fn cards_with(root: &Path, out: &Path, config: &Path) -> String {
    let output = Command::new(env!("CARGO_BIN_EXE_cookbook-cli"))
        .arg("--root")
        .arg(root)
        .arg("--config")
        .arg(config)
        .args(["cards", "--site-root", ROOT_URL, "--out"])
        .arg(out)
        .output()
        .expect("the binary runs");
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    assert!(
        output.status.success(),
        "{text}{}",
        String::from_utf8_lossy(&output.stderr)
    );
    text
}

#[test]
fn every_recipe_gets_three_cards_of_the_right_size() {
    let out = scratch("cards-sizes");
    let text = cards(&fixture(), &out);
    assert!(text.contains("1 rendered, 0 up to date"), "{text}");
    for (name, size) in [
        ("og", (1200, 630)),
        ("portrait", (1080, 1350)),
        ("story", (1080, 1920)),
    ] {
        let path = out.join(ID).join(format!("{name}.png"));
        assert_eq!(image::image_dimensions(&path).unwrap(), size, "{name}");
    }
}

#[test]
fn the_qr_code_decodes_to_the_recipe_address() {
    let out = scratch("cards-qr");
    cards(&fixture(), &out);
    for name in ["portrait", "story"] {
        let luma = image::open(out.join(ID).join(format!("{name}.png")))
            .unwrap()
            .to_luma8();
        let mut prepared = rqrr::PreparedImage::prepare(luma);
        let grids = prepared.detect_grids();
        assert_eq!(grids.len(), 1, "{name}");
        let (_, content) = grids[0].decode().expect("the symbol decodes");
        assert_eq!(content, format!("{ROOT_URL}/{ID}"), "{name}");
    }
}

#[test]
fn the_photo_fills_the_top_of_the_card() {
    let out = scratch("cards-photo");
    cards(&fixture(), &out);
    let card = image::open(out.join(ID).join("portrait.png"))
        .unwrap()
        .to_rgb8();
    // The typographic layout paints this corner caper green; a photo does not.
    let corner = card.get_pixel(4, 4).0;
    assert_ne!(corner, [0x0d, 0x4f, 0x8b]);
    assert!(corner[0] > 150, "the fixture's table is pale: {corner:?}");
}

#[test]
fn unchanged_recipes_are_skipped_and_edits_render_again() {
    let root = copy_fixture("cards-incremental", 200);
    let out = root.parent().unwrap().join("cards");
    assert!(cards(&root, &out).contains("1 rendered, 0 up to date"));
    let marker = out.join(ID).join("og.png");
    let first = fs::metadata(&marker).unwrap().modified().unwrap();

    assert!(cards(&root, &out).contains("0 rendered, 1 up to date"));
    assert_eq!(fs::metadata(&marker).unwrap().modified().unwrap(), first);

    let recipe = root.join("mains/lentil-soup.json");
    let edited = fs::read_to_string(&recipe)
        .unwrap()
        .replace("Lentil soup", "Red lentil soup");
    fs::write(&recipe, edited).unwrap();
    assert!(cards(&root, &out).contains("1 rendered, 0 up to date"));

    write_photo(&root, 90);
    assert!(cards(&root, &out).contains("1 rendered, 0 up to date"));

    fs::remove_file(out.join(ID).join("story.png")).unwrap();
    assert!(cards(&root, &out).contains("1 rendered, 0 up to date"));
}

#[test]
fn cards_of_removed_recipes_are_deleted() {
    let root = copy_fixture("cards-removed", 200);
    let out = root.parent().unwrap().join("cards");
    cards(&root, &out);
    fs::remove_file(root.join("mains/lentil-soup.json")).unwrap();
    fs::remove_file(root.join("mains/lentil-soup.png")).unwrap();
    fs::write(
        root.join("mains/other.json"),
        fs::read_to_string(fixture().join("mains/lentil-soup.json"))
            .unwrap()
            .replace(r#"  "image": { "src": "lentil-soup.jpg", "alt": "A bowl of orange lentil soup on a pale table" },"#, ""),
    )
    .unwrap();
    let text = cards(&root, &out);
    assert!(
        text.contains("1 rendered, 0 up to date, 1 removed"),
        "{text}"
    );
    assert!(!out.join(ID).exists());
    assert!(out.join("mains/other/og.png").is_file());
}

#[test]
fn a_recipe_without_a_photo_gets_the_typographic_layout() {
    let root = copy_fixture("cards-typographic", 200);
    let recipe = root.join("mains/lentil-soup.json");
    let text = fs::read_to_string(&recipe).unwrap();
    let start = text.find("  \"image\"").unwrap();
    let end = start + text[start..].find('\n').unwrap() + 1;
    fs::write(&recipe, format!("{}{}", &text[..start], &text[end..])).unwrap();
    fs::remove_file(root.join("mains/lentil-soup.png")).unwrap();
    let out = root.parent().unwrap().join("cards");
    cards(&root, &out);
    let card = image::open(out.join(ID).join("portrait.png"))
        .unwrap()
        .to_rgb8();
    assert_eq!(card.get_pixel(4, 4).0, [0x0d, 0x4f, 0x8b]);
}

fn render_with_instagram(name: &str, config: Option<&str>) -> PathBuf {
    let root = copy_fixture(name, 200);
    let out = root.parent().unwrap().join("cards");
    let path = root.parent().unwrap().join("config.json");
    match config {
        Some(text) => fs::write(&path, text).unwrap(),
        None => {
            let _ = fs::remove_file(&path);
        }
    }
    cards_with(&root, &out, &path);
    out.join(ID)
}

#[test]
fn the_instagram_handle_appears_on_sheets_but_not_on_the_link_preview() {
    let on = render_with_instagram(
        "cards-instagram-on",
        Some(r#"{ "social": { "instagram": { "enabled": true, "handle": "tonys_foods" } } }"#),
    );
    let off = render_with_instagram("cards-instagram-none", None);
    for name in ["portrait", "story"] {
        assert_ne!(
            fs::read(on.join(format!("{name}.png"))).unwrap(),
            fs::read(off.join(format!("{name}.png"))).unwrap(),
            "{name} should carry the handle"
        );
    }
    assert_eq!(
        fs::read(on.join("og.png")).unwrap(),
        fs::read(off.join("og.png")).unwrap()
    );
}

#[test]
fn a_disabled_or_invalid_handle_leaves_no_trace() {
    let none = render_with_instagram("cards-instagram-absent", None);
    let disabled = render_with_instagram(
        "cards-instagram-disabled",
        Some(r#"{ "social": { "instagram": { "enabled": false, "handle": "tonys_foods" } } }"#),
    );
    let invalid = render_with_instagram(
        "cards-instagram-invalid",
        Some(r#"{ "social": { "instagram": { "enabled": true, "handle": "not a handle" } } }"#),
    );
    for name in ["og", "portrait", "story"] {
        let file = format!("{name}.png");
        let expected = fs::read(none.join(&file)).unwrap();
        assert_eq!(
            fs::read(disabled.join(&file)).unwrap(),
            expected,
            "{name} disabled"
        );
        assert_eq!(
            fs::read(invalid.join(&file)).unwrap(),
            expected,
            "{name} invalid"
        );
    }
}
