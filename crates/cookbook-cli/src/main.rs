mod migrate;
mod report;
mod tree;

use std::{
    path::{Path, PathBuf},
    process::ExitCode,
};

use clap::{Parser, Subcommand, ValueEnum};
use cookbook_core::{Recipe, RecipeFile, Section, check_all};
use report::Report;

#[derive(Parser)]
#[command(version, about)]
struct Cli {
    /// The folder holding the recipe tree
    #[arg(long, global = true, default_value = "recipes")]
    root: PathBuf,
    #[command(subcommand)]
    command: Command,
}

#[derive(Clone, Copy, ValueEnum)]
enum SchemaKind {
    Recipe,
    Section,
}

#[derive(Subcommand)]
enum Command {
    /// Validate recipes against the schema and the recipe checklist
    Check {
        /// Check every recipe under `recipes/` (the default when no paths are given)
        #[arg(long)]
        all: bool,
        /// Print the report as JSON
        #[arg(long)]
        json: bool,
        /// Recipe files or folders to report on
        paths: Vec<PathBuf>,
    },
    /// Convert the legacy single-page site into a recipe tree
    MigrateLegacy {
        /// The legacy `index.html`
        html: PathBuf,
        /// The folder to write the recipe tree into
        #[arg(long, default_value = "recipes")]
        out: PathBuf,
    },
    /// Print the JSON Schema for recipes and sections
    Schema {
        /// Print only one schema instead of both
        kind: Option<SchemaKind>,
    },
}

/// Turns `recipes/a/b.json` or `a/b/` into the id prefix `a/b`.
fn selector(root: &Path, arg: &Path) -> String {
    let relative = arg.strip_prefix(root).unwrap_or(arg);
    let text = relative.to_string_lossy().replace('\\', "/");
    let text = text.trim_end_matches('/');
    text.strip_suffix(".json").unwrap_or(text).to_owned()
}

fn selected(subject: &str, selectors: &[String]) -> bool {
    selectors.is_empty()
        || selectors.iter().any(|s| {
            subject == s
                || subject
                    .strip_prefix(s.as_str())
                    .is_some_and(|rest| rest.starts_with('/'))
        })
}

fn check(root: &Path, all: bool, json: bool, paths: &[PathBuf]) -> ExitCode {
    if !tree::has_recipes(root) {
        println!("no recipes");
        return ExitCode::SUCCESS;
    }
    let loaded = match tree::load(root) {
        Ok(loaded) => loaded,
        Err(error) => {
            eprintln!("cannot read {}: {error}", root.display());
            return ExitCode::from(2);
        }
    };
    let selectors: Vec<String> = if all {
        Vec::new()
    } else {
        paths.iter().map(|p| selector(root, p)).collect()
    };
    let mut subjects: Vec<String> = loaded
        .collection
        .recipes
        .iter()
        .map(RecipeFile::id)
        .collect();
    subjects.extend(loaded.collection.unparsed.iter().cloned());
    subjects.sort();
    subjects.retain(|s| selected(s, &selectors));
    let results = check_all(&loaded.collection)
        .into_iter()
        .chain(loaded.parse_errors)
        .filter(|r| selected(&r.recipe, &selectors))
        .collect();
    let report = Report::new(subjects, results);
    println!("{}", if json { report.json() } else { report.text() });
    if report.errors() > 0 {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

fn schema(kind: Option<SchemaKind>) -> ExitCode {
    let recipe = schemars::schema_for!(Recipe);
    let section = schemars::schema_for!(Section);
    let value = match kind {
        Some(SchemaKind::Recipe) => serde_json::to_value(recipe),
        Some(SchemaKind::Section) => serde_json::to_value(section),
        None => serde_json::to_value(serde_json::json!({ "Recipe": recipe, "Section": section })),
    };
    match value.and_then(|v| serde_json::to_string_pretty(&v)) {
        Ok(text) => {
            println!("{text}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("cannot render the schema: {error}");
            ExitCode::from(2)
        }
    }
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Check { all, json, paths } => check(&cli.root, all, json, &paths),
        Command::MigrateLegacy { html, out } => match migrate::run(&html, &out) {
            Ok(summary) => {
                println!("{summary}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("migration failed: {error}");
                ExitCode::FAILURE
            }
        },
        Command::Schema { kind } => schema(kind),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selectors_strip_the_root_and_extension() {
        let root = Path::new("recipes");
        assert_eq!(selector(root, Path::new("recipes/a/b.json")), "a/b");
        assert_eq!(selector(root, Path::new("a/b/")), "a/b");
    }

    #[test]
    fn selection_matches_files_and_folders() {
        let sel = vec!["a/b".to_owned()];
        assert!(selected("a/b", &sel) && selected("a/b/c", &sel));
        assert!(!selected("a/bc", &sel) && !selected("a", &sel));
        assert!(selected("anything", &[]));
    }
}
