use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

const ID: &str = "mains/lentil-soup";

const PAGE: &str = r#"<html><head>
<meta property="og:image" content="https://example.org/cards/mains/lentil-soup/og.png"/>
<script type="application/ld+json">{"@type":"Recipe","name":"Lentil soup","recipeIngredient":["1 onion"],"recipeInstructions":[{"@type":"HowToStep","text":"Simmer."}]}</script>
</head><body></body></html>"#;

fn write(path: PathBuf, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn build_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("cookbook-verify-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    write(dir.join("mains/lentil-soup.html"), PAGE);
    write(dir.join("cards/mains/lentil-soup/og.png"), "png");
    write(
        dir.join("data/index.json"),
        &format!(r#"{{"sections":[{{"sections":[],"recipes":[{{"id":"{ID}"}}]}}]}}"#),
    );
    write(
        dir.join("data/search.json"),
        &format!(r#"{{"docs":[{{"id":"{ID}"}}]}}"#),
    );
    dir
}

fn verify(build: &Path) -> (i32, String) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/valid/recipes");
    let output = Command::new(env!("CARGO_BIN_EXE_cookbook-cli"))
        .arg("--root")
        .arg(root)
        .arg("verify-site")
        .arg(build)
        .output()
        .unwrap();
    (
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).into_owned(),
    )
}

#[test]
fn a_sound_site_passes() {
    let build = build_dir("sound");
    let (code, out) = verify(&build);
    assert_eq!(code, 0, "{out}");
}

#[test]
fn every_missing_piece_is_reported() {
    let build = build_dir("broken");
    fs::remove_file(build.join("cards/mains/lentil-soup/og.png")).unwrap();
    write(build.join("mains/lentil-soup.html"), "<html></html>");
    write(build.join("data/search.json"), r#"{"docs":[]}"#);
    let (code, out) = verify(&build);
    assert_eq!(code, 1, "{out}");
    for expected in [
        "no JSON-LD",
        "no og:image",
        "missing from the search index",
        "no Open Graph card",
    ] {
        assert!(out.contains(expected), "{expected}: {out}");
    }
}

#[test]
fn a_page_count_mismatch_is_reported() {
    let build = build_dir("count");
    write(
        build.join("data/index.json"),
        r#"{"sections":[{"sections":[],"recipes":[]}]}"#,
    );
    let (code, out) = verify(&build);
    assert_eq!(code, 1, "{out}");
    assert!(
        out.contains("the index lists 0 recipes for 1 recipe files"),
        "{out}"
    );
}
