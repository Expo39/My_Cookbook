use std::{fs, path::Path, process::ExitCode};

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Validate recipes against the schema and the recipe checklist
    Check {
        /// Check every recipe under `recipes/`
        #[arg(long)]
        all: bool,
    },
}

fn has_recipes(dir: &Path) -> bool {
    fs::read_dir(dir).is_ok_and(|mut entries| entries.next().is_some())
}

fn main() -> ExitCode {
    match Cli::parse().command {
        Command::Check { .. } => {
            if !has_recipes(Path::new("recipes")) {
                println!("no recipes");
            }
            ExitCode::SUCCESS
        }
    }
}

#[cfg(test)]
mod tests {
    use super::has_recipes;
    use std::path::Path;

    #[test]
    fn missing_directory_has_no_recipes() {
        assert!(!has_recipes(Path::new("does-not-exist")));
    }
}
