mod build;
mod cards;
mod config;
mod images;
mod migrate;
mod report;
mod verify;

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
    /// The site settings; a missing file means the defaults
    #[arg(long, global = true, default_value = "cookbook.config.json")]
    config: PathBuf,
    #[command(subcommand)]
    command: Command,
}

#[derive(Clone, Copy, ValueEnum)]
enum SchemaKind {
    Recipe,
    Section,
    /// Every type the web app consumes, as one set of definitions
    Web,
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
    /// Check the tree, then write the data the static site reads
    Build {
        /// The folder to write `index.json`, `search.json`, `manifest.json` and `recipes/` into
        #[arg(long, default_value = "web/static/data")]
        out: PathBuf,
        /// The folder to write the resized recipe photos into
        #[arg(long, default_value = "web/static/img")]
        images_out: PathBuf,
    },
    /// Render the share cards (Open Graph, portrait and story) for every recipe, skipping those that are up to date
    Cards {
        /// The folder to write `<id>/og.png`, `portrait.png` and `story.png` into
        #[arg(long, default_value = "web/static/cards")]
        out: PathBuf,
        /// The address the cards link to; defaults to `PUBLIC_SITE_URL` and `BASE_PATH`, then the `site` settings
        #[arg(long)]
        site_root: Option<String>,
    },
    /// Check a built site: every recipe is listed, pre-rendered, searchable, has JSON-LD and an Open Graph card
    VerifySite {
        /// The built site
        #[arg(default_value = "web/build")]
        build: PathBuf,
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
    if !cookbook_tree::has_recipes(root) {
        println!("no recipes");
        return ExitCode::SUCCESS;
    }
    let loaded = match cookbook_tree::load(root) {
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

fn web_schema() -> serde_json::Value {
    let mut generator = schemars::SchemaGenerator::default();
    generator.subschema_for::<Recipe>();
    generator.subschema_for::<Section>();
    generator.subschema_for::<cookbook_core::RecipeData>();
    generator.subschema_for::<cookbook_core::SiteIndex>();
    generator.subschema_for::<cookbook_core::Manifest>();
    generator.subschema_for::<cookbook_core::ScaleRequest>();
    generator.subschema_for::<cookbook_core::ScaleOptions>();
    generator.subschema_for::<cookbook_core::CheckResult>();
    generator.subschema_for::<cookbook_core::CheckContext>();
    generator.subschema_for::<cookbook_core::RecipeFile>();
    generator.subschema_for::<cookbook_core::SearchHit>();
    generator.subschema_for::<cookbook_core::Suggestion>();
    generator.subschema_for::<cookbook_core::Coverage>();
    serde_json::json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Web",
        "$defs": generator.take_definitions(true),
    })
}

fn schema(kind: Option<SchemaKind>) -> ExitCode {
    let recipe = schemars::schema_for!(Recipe);
    let section = schemars::schema_for!(Section);
    let value = match kind {
        Some(SchemaKind::Recipe) => serde_json::to_value(recipe),
        Some(SchemaKind::Section) => serde_json::to_value(section),
        Some(SchemaKind::Web) => Ok(web_schema()),
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
        Command::Cards { out, site_root } => {
            let config = config::Config::load(&cli.config);
            let site_root = site_root.unwrap_or_else(|| config.site_root());
            match cards::run(&cli.root, &out, &site_root, config.instagram().as_deref()) {
                Ok(summary) => {
                    println!(
                        "cards: {} rendered, {} up to date, {} removed in {:.2?}",
                        summary.rendered, summary.skipped, summary.removed, summary.elapsed
                    );
                    ExitCode::SUCCESS
                }
                Err(build::BuildError::Check(report)) => {
                    println!("{report}");
                    eprintln!("the checklist has errors, so no cards were rendered");
                    ExitCode::FAILURE
                }
                Err(build::BuildError::Other(message)) => {
                    eprintln!("cards failed: {message}");
                    ExitCode::FAILURE
                }
            }
        }
        Command::Build { out, images_out } => match build::run(&cli.root, &out, &images_out) {
            Ok(built) => {
                println!("built {} recipes into {}", built.count, out.display());
                if !built.warnings.is_empty() {
                    println!(
                        "{} warnings; run `check --all` for details",
                        built.warnings.len()
                    );
                }
                ExitCode::SUCCESS
            }
            Err(build::BuildError::Check(report)) => {
                println!("{report}");
                eprintln!("the checklist has errors, so nothing was built");
                ExitCode::FAILURE
            }
            Err(build::BuildError::Other(message)) => {
                eprintln!("build failed: {message}");
                ExitCode::FAILURE
            }
        },
        Command::VerifySite { build } => match verify::run(&cli.root, &build) {
            Ok(problems) if problems.is_empty() => {
                println!("verified the site in {}", build.display());
                ExitCode::SUCCESS
            }
            Ok(problems) => {
                for problem in &problems {
                    println!("error {problem}");
                }
                eprintln!("{} problems in the built site", problems.len());
                ExitCode::FAILURE
            }
            Err(message) => {
                eprintln!("verify-site failed: {message}");
                ExitCode::from(2)
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
