use std::{collections::BTreeMap, fmt::Write};

use cookbook_core::{CheckResult, Level};
use serde_json::json;

pub struct Report {
    /// Subjects in display order, with their results (possibly none).
    pub entries: Vec<(String, Vec<CheckResult>)>,
}

impl Report {
    /// `subjects` are the recipes to list even when clean; results for other subjects are listed too.
    pub fn new(subjects: Vec<String>, results: Vec<CheckResult>) -> Self {
        let mut by_subject: BTreeMap<String, Vec<CheckResult>> = BTreeMap::new();
        for result in results {
            by_subject
                .entry(result.recipe.clone())
                .or_default()
                .push(result);
        }
        let mut entries: Vec<(String, Vec<CheckResult>)> = subjects
            .into_iter()
            .map(|s| {
                let found = by_subject.remove(&s).unwrap_or_default();
                (s, found)
            })
            .collect();
        entries.extend(by_subject);
        Self { entries }
    }

    fn count(&self, level: Level) -> usize {
        self.entries
            .iter()
            .flat_map(|(_, r)| r)
            .filter(|r| r.level == level)
            .count()
    }

    pub fn errors(&self) -> usize {
        self.count(Level::Error)
    }

    pub fn text(&self) -> String {
        let mut out = String::new();
        for (subject, results) in &self.entries {
            let mark = if results.iter().any(|r| r.level == Level::Error) {
                "✗"
            } else if results.is_empty() {
                "✓"
            } else {
                "⚠"
            };
            let _ = writeln!(out, "{mark} {subject}");
            for r in results {
                let mark = if r.level == Level::Error {
                    "✗"
                } else {
                    "⚠"
                };
                let at = if r.path.is_empty() {
                    String::new()
                } else {
                    format!(" {}", r.path)
                };
                let _ = writeln!(out, "    {mark} {}{at}: {}", r.id, r.message);
            }
        }
        let failing = self
            .entries
            .iter()
            .filter(|(_, r)| r.iter().any(|x| x.level == Level::Error))
            .count();
        let _ = write!(
            out,
            "\n{} checked, {} with errors; {} errors, {} warnings",
            self.entries.len(),
            failing,
            self.errors(),
            self.count(Level::Warning)
        );
        out
    }

    pub fn json(&self) -> String {
        let recipes: Vec<_> = self
            .entries
            .iter()
            .map(|(id, results)| {
                json!({
                    "id": id,
                    "ok": !results.iter().any(|r| r.level == Level::Error),
                    "results": results,
                })
            })
            .collect();
        let report = json!({
            "recipes": recipes,
            "summary": {
                "checked": self.entries.len(),
                "errors": self.errors(),
                "warnings": self.count(Level::Warning),
            },
        });
        serde_json::to_string_pretty(&report).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(recipe: &str, level: Level) -> CheckResult {
        CheckResult {
            id: if level == Level::Error { "E-X" } else { "W-X" },
            level,
            message: "m".into(),
            path: "p".into(),
            recipe: recipe.into(),
        }
    }

    #[test]
    fn marks_and_summary() {
        let report = Report::new(
            vec!["a".into(), "b".into(), "c".into()],
            vec![
                result("b", Level::Warning),
                result("c", Level::Error),
                result("folder", Level::Error),
            ],
        );
        let text = report.text();
        assert!(
            text.contains("✓ a")
                && text.contains("⚠ b")
                && text.contains("✗ c")
                && text.contains("✗ folder")
        );
        assert!(text.ends_with("4 checked, 2 with errors; 2 errors, 1 warnings"));
        assert_eq!(report.errors(), 2);
    }
}
