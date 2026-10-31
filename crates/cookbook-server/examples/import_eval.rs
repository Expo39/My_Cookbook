//! Runs the recipe importer against real Gemini on the sample recipes, with the old short
//! instruction and with the current one (house rules, worked example and one repair round), and
//! reports how each did. Run it with `make import-eval`; the key comes from `.gemini-key`, and the
//! imports are saved in `web/test-results/import-eval`.

use std::{collections::BTreeSet, env, fs, path::Path, time::Instant};

use cookbook_ai::{
    DEFAULT_MODEL, GeminiConfig, Imported, Request, import_request, parse_import_response,
    repair_request, review_import, settle_import,
};
use cookbook_core::{Level, Qty};
use cookbook_server::{Gemini, HttpGemini};

/// The instruction the importer used before the house rules were written out, kept for comparison.
const OLD_INSTRUCTION: &str = "You convert a pasted recipe into JSON for Antonio's cookbook. \
Return only JSON that matches the response schema. \
Use British English and metric units where the source gives them; keep the source's units otherwise. \
Do not invent ingredients, amounts or steps that the text does not contain. \
Give every ingredient used in the method a short lowercase `key`, and refer to it in the step text as {@key}, \
for example \"Simmer {@lentils} for 20 minutes.\" \
Write oven temperatures as {temp:200} and durations as {timer:20}, and keep the numbers from the source. \
Set `servings` to the number the source states, or 4 if it is silent. \
Put each method step in `steps`, and leave out anything that is not part of the recipe.";

struct Outcome {
    imported: Option<Imported>,
    repaired: bool,
    error: Option<String>,
    millis: u128,
}

async fn ask(gemini: &HttpGemini, request: &Request) -> Result<String, String> {
    let reply = gemini
        .generate(request)
        .await
        .and_then(|response| response.reply())
        .map_err(|e| e.to_string())?;
    Ok(reply.text)
}

async fn old_way(gemini: &HttpGemini, config: &GeminiConfig, text: &str) -> Outcome {
    let started = Instant::now();
    let mut request = import_request(config, text);
    if let Some(instruction) = request.system_instruction.as_mut() {
        instruction.parts[0].text = OLD_INSTRUCTION.to_owned();
    }
    let result = ask(gemini, &request).await;
    let millis = started.elapsed().as_millis();
    match result.map(|answer| parse_import_response(&answer, text)) {
        Ok(Ok(imported)) => Outcome {
            imported: Some(imported),
            repaired: false,
            error: None,
            millis,
        },
        Ok(Err(e)) => Outcome {
            imported: None,
            repaired: false,
            error: Some(e.to_string()),
            millis,
        },
        Err(e) => Outcome {
            imported: None,
            repaired: false,
            error: Some(e),
            millis,
        },
    }
}

async fn new_way(gemini: &HttpGemini, config: &GeminiConfig, text: &str) -> Outcome {
    let started = Instant::now();
    let answer = match ask(gemini, &import_request(config, text)).await {
        Ok(answer) => answer,
        Err(e) => {
            return Outcome {
                imported: None,
                repaired: false,
                error: Some(e),
                millis: started.elapsed().as_millis(),
            };
        }
    };
    let first = review_import(&answer, text);
    let (imported, repaired) = match (first.problems, first.draft) {
        (None, Some(draft)) => (Ok(draft), false),
        (problems, draft) => {
            let repair = repair_request(config, text, &answer, &problems.unwrap_or_default());
            let again = ask(gemini, &repair)
                .await
                .map_err(|_| cookbook_ai::AiError::Unavailable)
                .and_then(|again| parse_import_response(&again, text));
            (settle_import(draft, again, text), true)
        }
    };
    let millis = started.elapsed().as_millis();
    match imported {
        Ok(imported) => Outcome {
            imported: Some(imported),
            repaired,
            error: None,
            millis,
        },
        Err(e) => Outcome {
            imported: None,
            repaired,
            error: Some(e.to_string()),
            millis,
        },
    }
}

/// Every number written in the source, with fractions such as "1/2", "½" and "1 1/2" read as decimals.
fn source_numbers(text: &str) -> Vec<f64> {
    let text = text
        .replace('½', " 0.5")
        .replace('¼', " 0.25")
        .replace('¾', " 0.75");
    let mut numbers = Vec::new();
    let mut run = String::new();
    for c in text.chars().chain(std::iter::once(' ')) {
        if c.is_ascii_digit() || c == '.' || c == '/' {
            run.push(c);
        } else if !run.is_empty() {
            let value = match run.split_once('/') {
                Some((a, b)) => a
                    .parse::<f64>()
                    .ok()
                    .zip(b.parse::<f64>().ok())
                    .map(|(a, b)| a / b),
                None => run.trim_end_matches('.').parse::<f64>().ok(),
            };
            if let Some(value) = value {
                if let Some(last) = numbers.last().copied().filter(|_| run.contains('/')) {
                    numbers.push(last + value);
                }
                numbers.push(value);
            }
            run.clear();
        }
    }
    numbers
}

/// Numbers in the import that the source does not give, allowing what the house rules derive:
/// the middle of a range, a conventional temperature from a fan one, and Celsius from Fahrenheit.
fn unexplained_numbers(imported: &Imported, source: &str) -> Vec<String> {
    let given = source_numbers(source);
    let close = |a: f64, b: f64| (a - b).abs() < 0.01;
    let mut allowed: Vec<f64> = given.clone();
    for (i, a) in given.iter().enumerate() {
        allowed.push(a + 20.0);
        allowed.push(((a - 32.0) * 5.0 / 9.0 / 10.0).round() * 10.0);
        allowed.push(a * 60.0);
        if let Some(b) = given.get(i + 1) {
            allowed.push((a + b) / 2.0);
        }
    }
    allowed.push(4.0);
    let explained = |n: f64| allowed.iter().any(|a| close(*a, n));

    let mut found = BTreeSet::new();
    let recipe = &imported.recipe;
    let mut check = |label: &str, n: f64| {
        if !explained(n) {
            found.insert(format!("{label} {n}"));
        }
    };
    check("servings", f64::from(recipe.servings));
    for group in &recipe.ingredient_groups {
        for item in &group.items {
            if let Some(amount) = &item.amount {
                match amount.qty {
                    Qty::Single(n) => check("amount", n),
                    Qty::Range(range) => {
                        check("amount", range.min);
                        check("amount", range.max);
                    }
                }
            }
        }
    }
    if let Some(times) = &recipe.times {
        for minutes in [times.prep, times.cook, times.rest].into_iter().flatten() {
            check("time", f64::from(minutes));
        }
    }
    for step in &recipe.steps {
        for token in step.text.split('{').skip(1) {
            let inner = token.split('}').next().unwrap_or_default();
            if inner.starts_with("timer:") || inner.starts_with("temp:") {
                for n in source_numbers(inner.split('|').next().unwrap_or_default()) {
                    check("token", n);
                }
            }
        }
    }
    found.into_iter().collect()
}

fn summary(name: &str, way: &str, outcome: &Outcome, source: &str, out: &Path) {
    let Some(imported) = &outcome.imported else {
        println!(
            "| {name} | {way} | failed: {} | | | | | {} ms |",
            outcome.error.as_deref().unwrap_or("?"),
            outcome.millis
        );
        return;
    };
    let errors: Vec<String> = imported
        .checks
        .iter()
        .filter(|c| c.level == Level::Error)
        .map(|c| format!("{} at {}", c.id, c.path))
        .collect();
    let warnings: Vec<_> = imported
        .checks
        .iter()
        .filter(|c| c.level == Level::Warning)
        .map(|c| c.id)
        .collect();
    let tokens: usize = imported
        .recipe
        .steps
        .iter()
        .map(|s| s.text.matches("{@").count())
        .sum();
    let items: usize = imported
        .recipe
        .ingredient_groups
        .iter()
        .map(|g| g.items.len())
        .sum();
    let unexplained = unexplained_numbers(imported, source);
    println!(
        "| {name} | {way} | {} | {} | {} | {items} / {} | {tokens} | {} | {} ms |",
        if outcome.repaired { "yes" } else { "no" },
        if errors.is_empty() {
            "none".to_owned()
        } else {
            errors.join(", ")
        },
        if warnings.is_empty() {
            "none".to_owned()
        } else {
            warnings.join(", ")
        },
        imported.recipe.steps.len(),
        if unexplained.is_empty() {
            "none".to_owned()
        } else {
            unexplained.join(", ")
        },
        outcome.millis
    );
    let file = out.join(format!("{name}.{way}.json"));
    let _ = fs::write(
        file,
        serde_json::to_string_pretty(&imported.recipe).unwrap_or_default(),
    );
}

#[tokio::main]
async fn main() {
    let key = env::var("GEMINI_API_KEY").unwrap_or_default();
    if key.trim().is_empty() {
        eprintln!(
            "GEMINI_API_KEY is not set. Put a Google AI Studio key in .gemini-key and run make import-eval."
        );
        std::process::exit(2);
    }
    let model = env::var("GEMINI_MODEL")
        .ok()
        .filter(|model| !model.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_owned());
    let samples = env::args()
        .nth(1)
        .unwrap_or_else(|| "crates/cookbook-ai/prompts/samples".to_owned());
    let out = Path::new("web/test-results/import-eval");
    let _ = fs::create_dir_all(out);
    let gemini = HttpGemini::new(key.trim().to_owned(), model.clone()).expect("an HTTP client");
    let config = GeminiConfig {
        model: model.clone(),
        ..GeminiConfig::default()
    };

    let mut files: Vec<_> = fs::read_dir(&samples)
        .expect("the samples folder")
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|e| e == "txt"))
        .collect();
    files.sort();

    println!("Model: {model}\n");
    println!(
        "| sample | prompt | repaired | errors | warnings | ingredients / steps | tokens | numbers not in the source | time |"
    );
    println!("|---|---|---|---|---|---|---|---|---|");
    for path in files {
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("sample")
            .to_owned();
        let source = fs::read_to_string(&path).unwrap_or_default();
        let old = old_way(&gemini, &config, &source).await;
        summary(&name, "old", &old, &source, out);
        std::thread::sleep(std::time::Duration::from_secs(5));
        let new = new_way(&gemini, &config, &source).await;
        summary(&name, "new", &new, &source, out);
        // The free tier allows about fifteen requests a minute.
        std::thread::sleep(std::time::Duration::from_secs(8));
    }
    println!("\nEach import is saved in {}.", out.display());
}
