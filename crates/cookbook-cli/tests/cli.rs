use std::{path::PathBuf, process::Command};

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
        .join("recipes")
}

fn run(args: &[&str], root: PathBuf) -> (i32, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_cookbook-cli"))
        .arg("--root")
        .arg(root)
        .args(args)
        .output()
        .expect("the binary runs");
    (
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).into_owned(),
    )
}

#[test]
fn a_valid_tree_passes() {
    let (code, out) = run(&["check", "--all"], fixture("valid"));
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("✓ mains/lentil-soup"), "{out}");
    assert!(out.contains("1 checked, 0 with errors"), "{out}");
}

#[test]
fn an_invalid_tree_fails_with_stable_codes() {
    let (code, out) = run(&["check", "--all"], fixture("invalid"));
    assert_eq!(code, 1, "{out}");
    for expected in [
        "✗ mains/broken-soup",
        "E-QTY-POSITIVE",
        "E-TOKEN-UNRESOLVED",
        "W-BRITISH-SPELLING",
        "E-SCHEMA-PARSE",
        "E-SECTION-MISSING",
    ] {
        assert!(out.contains(expected), "missing {expected} in\n{out}");
    }
}

#[test]
fn json_output_is_structured() {
    let (code, out) = run(&["check", "--json"], fixture("invalid"));
    assert_eq!(code, 1);
    let report: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert!(report["summary"]["errors"].as_u64().unwrap() >= 4);
    let broken = report["recipes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == "mains/broken-soup")
        .unwrap();
    assert_eq!(broken["ok"], false);
    assert_eq!(broken["results"][0]["level"], "error");
}

#[test]
fn paths_limit_the_report() {
    let (code, out) = run(&["check", "mains/typo.json"], fixture("invalid"));
    assert_eq!(code, 1);
    assert!(
        out.contains("E-SCHEMA-PARSE") && !out.contains("broken-soup"),
        "{out}"
    );
    let (code, out) = run(&["check", "mains/lentil-soup"], fixture("valid"));
    assert_eq!(code, 0, "{out}");
}

#[test]
fn a_missing_tree_is_skipped() {
    let (code, out) = run(&["check", "--all"], fixture("nowhere"));
    assert_eq!(code, 0);
    assert_eq!(out.trim(), "no recipes");
}

#[test]
fn schema_prints_both_types() {
    let (code, out) = run(&["schema"], fixture("valid"));
    assert_eq!(code, 0);
    let schema: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert!(schema["Recipe"]["properties"]["ingredientGroups"].is_object());
    assert!(schema["Section"]["properties"]["title"].is_object());
    let (_, single) = run(&["schema", "section"], fixture("valid"));
    assert!(
        serde_json::from_str::<serde_json::Value>(&single).unwrap()["properties"]["order"]
            .is_object()
    );
}
