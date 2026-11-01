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

fn build(root: &Path, out: &Path) -> (i32, String, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_cookbook-cli"))
        .env("SOURCE_DATE_EPOCH", "1700000000")
        .arg("--root")
        .arg(root)
        .arg("build")
        .arg("--out")
        .arg(out)
        .output()
        .expect("the binary runs");
    (
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    )
}

fn json(path: &Path) -> serde_json::Value {
    serde_json::from_str(&fs::read_to_string(path).expect("the file exists")).unwrap()
}

#[test]
fn a_valid_tree_emits_every_file() {
    let out = scratch("build-valid");
    let (code, stdout, stderr) = build(&fixture("valid"), &out);
    assert_eq!(code, 0, "{stdout}{stderr}");

    let manifest = json(&out.join("manifest.json"));
    assert_eq!(manifest["count"], 1);
    assert_eq!(manifest["ids"][0], "mains/lentil-soup");
    assert_eq!(manifest["builtAt"], "2023-11-14T22:13:20Z");

    let index = json(&out.join("index.json"));
    let mains = &index["sections"][0];
    assert_eq!(mains["path"], "mains");
    assert_eq!(mains["title"], "Mains");
    let card = &mains["recipes"][0];
    assert_eq!(card["slug"], "lentil-soup");
    assert_eq!(card["times"]["total"], 45);
    assert_eq!(card["section"][0], "Mains");

    let page = json(&out.join("recipes/mains/lentil-soup.json"));
    assert_eq!(page["recipe"]["title"], "Lentil soup");
    assert_eq!(page["view"]["factor"], 1.0);
    assert!(
        page["view"]["groups"][0]["items"][0]["text"]
            .as_str()
            .unwrap()
            .contains("250 g red lentils")
    );
    assert!(out.join("search.json").is_file());
}

#[test]
fn output_is_deterministic() {
    let (first, second) = (scratch("build-first"), scratch("build-second"));
    build(&fixture("valid"), &first);
    build(&fixture("valid"), &second);
    for file in [
        "index.json",
        "search.json",
        "manifest.json",
        "recipes/mains/lentil-soup.json",
    ] {
        assert_eq!(
            fs::read(first.join(file)).unwrap(),
            fs::read(second.join(file)).unwrap(),
            "{file} differs"
        );
    }
}

#[test]
fn errors_stop_the_build_and_print_the_checklist() {
    let out = scratch("build-invalid");
    let (code, stdout, _) = build(&fixture("invalid"), &out);
    assert_eq!(code, 1);
    assert!(stdout.contains("E-TOKEN-UNRESOLVED"), "{stdout}");
    assert!(!out.exists(), "nothing is written when the checklist fails");
}

#[test]
fn an_empty_tree_is_refused() {
    let out = scratch("build-empty");
    let (code, _, stderr) = build(&fixture("nowhere"), &out);
    assert_eq!(code, 1);
    assert!(stderr.contains("no recipes"), "{stderr}");
}
