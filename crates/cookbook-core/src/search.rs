use std::collections::{BTreeMap, HashMap};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::schema::Recipe;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeSummary {
    pub id: String,
    pub title: String,
    pub title_local: Option<String>,
    pub tags: Vec<String>,
    /// Titles of the sections the recipe sits in, outermost first.
    pub section_path: Vec<String>,
    pub ingredients: Vec<SummaryIngredient>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryIngredient {
    pub item: String,
    pub food: Option<String>,
    pub optional: bool,
}

impl RecipeSummary {
    pub fn from_recipe(id: &str, recipe: &Recipe, section_path: &[String]) -> Self {
        Self {
            id: id.to_owned(),
            title: recipe.title.clone(),
            title_local: recipe.title_local.clone(),
            tags: recipe.tags.clone(),
            section_path: section_path.to_vec(),
            ingredients: recipe
                .ingredients()
                .map(|i| SummaryIngredient {
                    item: i.item.clone().unwrap_or_default(),
                    food: i.food.clone(),
                    optional: i.optional,
                })
                .collect(),
        }
    }
}

#[derive(Clone, Copy)]
enum Field {
    Title,
    TitleLocal,
    Tag,
    Section,
    Item,
    Food,
}

impl Field {
    fn weight(code: u8) -> f64 {
        match code {
            0 => 10.0,
            1 => 9.0,
            2 => 4.0,
            3 => 2.0,
            _ => 3.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IndexedDoc {
    id: String,
    title: String,
    /// Normalised tokens per non-optional ingredient.
    ingredients: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IndexedTerm {
    term: String,
    /// `(document, field)` pairs.
    postings: Vec<(u32, u8)>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SearchIndex {
    docs: Vec<IndexedDoc>,
    terms: Vec<IndexedTerm>,
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
pub struct SearchHit {
    pub id: String,
    pub score: f64,
}

/// One line under the search box while the cook types.
#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Suggestion {
    /// A recipe whose title (or ingredients) match what has been typed so far.
    Recipe { id: String, title: String },
    /// An ingredient word that completes the last word typed, e.g. "garl" to "garlic".
    Ingredient { term: String },
    /// The query with each unknown word swapped for the closest word in the index.
    Correction { query: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
pub struct Coverage {
    pub id: String,
    pub matched: usize,
    pub total: usize,
    pub ratio: f64,
}

const FOLDS: &[(&str, &str)] = &[
    ("àáâãäåāăą", "a"),
    ("çćĉċč", "c"),
    ("ďđ", "d"),
    ("èéêëēĕėęě", "e"),
    ("ĝğġģ", "g"),
    ("ĥħ", "h"),
    ("ìíîïĩīĭįı", "i"),
    ("ĵ", "j"),
    ("ķ", "k"),
    ("ĺļľŀł", "l"),
    ("ñńņň", "n"),
    ("òóôõöøōŏő", "o"),
    ("ŕŗř", "r"),
    ("śŝşš", "s"),
    ("ţťŧ", "t"),
    ("ùúûüũūŭůűų", "u"),
    ("ŵ", "w"),
    ("ýÿŷ", "y"),
    ("źżž", "z"),
    ("ß", "ss"),
    ("æ", "ae"),
    ("œ", "oe"),
];

/// Lower-cases, strips accents (including Maltese ċ ġ ħ ż) and splits on anything that is not a letter or digit.
pub fn tokenise(text: &str) -> Vec<String> {
    let mut folded = String::with_capacity(text.len());
    for c in text.chars().flat_map(char::to_lowercase) {
        match FOLDS.iter().find(|(from, _)| from.contains(c)) {
            Some((_, to)) => folded.push_str(to),
            None => folded.push(c),
        }
    }
    folded
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(str::to_owned)
        .collect()
}

fn within_one_edit(a: &[char], b: &[char]) -> bool {
    if a.len().abs_diff(b.len()) > 1 {
        return false;
    }
    if a.len() == b.len() {
        let diffs: Vec<usize> = (0..a.len()).filter(|&i| a[i] != b[i]).collect();
        return match diffs.as_slice() {
            [] | [_] => true,
            [i, j] => *j == i + 1 && a[*i] == b[*j] && a[*j] == b[*i],
            _ => false,
        };
    }
    let (short, long) = if a.len() < b.len() { (a, b) } else { (b, a) };
    let common = short.iter().zip(long).take_while(|(x, y)| x == y).count();
    short[common..] == long[common + 1..]
}

fn close_enough(query: &str, term: &str) -> bool {
    let (q, t): (Vec<char>, Vec<char>) = (query.chars().collect(), term.chars().collect());
    q.len() >= 5 && within_one_edit(&q, &t)
}

impl SearchIndex {
    pub fn build(summaries: &[RecipeSummary]) -> Self {
        let mut docs = Vec::with_capacity(summaries.len());
        let mut terms: BTreeMap<String, Vec<(u32, u8)>> = BTreeMap::new();
        for (n, summary) in summaries.iter().enumerate() {
            let doc = n as u32;
            let mut add = |field: Field, text: &str| {
                for token in tokenise(text) {
                    let postings = terms.entry(token).or_default();
                    if !postings.contains(&(doc, field as u8)) {
                        postings.push((doc, field as u8));
                    }
                }
            };
            add(Field::Title, &summary.title);
            if let Some(local) = &summary.title_local {
                add(Field::TitleLocal, local);
            }
            for tag in &summary.tags {
                add(Field::Tag, tag);
            }
            for section in &summary.section_path {
                add(Field::Section, section);
            }
            let mut ingredients = Vec::new();
            for ingredient in &summary.ingredients {
                add(Field::Item, &ingredient.item);
                if let Some(food) = &ingredient.food {
                    add(Field::Food, food);
                }
                if !ingredient.optional {
                    let mut tokens = tokenise(&ingredient.item);
                    tokens.extend(ingredient.food.iter().flat_map(|f| tokenise(f)));
                    ingredients.push(tokens);
                }
            }
            docs.push(IndexedDoc {
                id: summary.id.clone(),
                title: summary.title.clone(),
                ingredients,
            });
        }
        Self {
            docs,
            terms: terms
                .into_iter()
                .map(|(term, postings)| IndexedTerm { term, postings })
                .collect(),
        }
    }

    /// The recipe ids in index order.
    pub fn ids(&self) -> impl Iterator<Item = &str> {
        self.docs.iter().map(|d| d.id.as_str())
    }

    pub fn len(&self) -> usize {
        self.docs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.docs.is_empty()
    }

    fn term_scores(&self, query: &str) -> HashMap<u32, f64> {
        let mut best: HashMap<u32, f64> = HashMap::new();
        let mut credit = |term: &IndexedTerm, quality: f64| {
            for (doc, field) in &term.postings {
                let score = Field::weight(*field) * quality;
                let entry = best.entry(*doc).or_insert(0.0);
                if score > *entry {
                    *entry = score;
                }
            }
        };
        let start = self.terms.partition_point(|t| t.term.as_str() < query);
        for term in self.terms[start..]
            .iter()
            .take_while(|t| t.term.starts_with(query))
        {
            credit(term, if term.term == query { 1.0 } else { 0.8 });
        }
        for term in self.terms.iter().filter(|t| !t.term.starts_with(query)) {
            if close_enough(query, &term.term) {
                credit(term, 0.5);
            }
        }
        best
    }

    /// Every query word has to match; title hits outrank ingredient hits.
    pub fn search(&self, query: &str) -> Vec<SearchHit> {
        let words = tokenise(query);
        let mut totals: Option<HashMap<u32, f64>> = None;
        for word in &words {
            let scores = self.term_scores(word);
            totals = Some(match totals {
                None => scores,
                Some(previous) => previous
                    .into_iter()
                    .filter_map(|(doc, total)| scores.get(&doc).map(|s| (doc, total + s)))
                    .collect(),
            });
        }
        let mut hits: Vec<SearchHit> = totals
            .unwrap_or_default()
            .into_iter()
            .map(|(doc, score)| SearchHit {
                id: self.docs[doc as usize].id.clone(),
                score,
            })
            .collect();
        hits.sort_by(|a, b| {
            b.score
                .total_cmp(&a.score)
                .then_with(|| self.title_of(&a.id).cmp(self.title_of(&b.id)))
        });
        hits
    }

    /// Suggestions for a query still being typed: the best recipes, then ingredient words that
    /// complete the last word, or a corrected query when nothing matches. At most `limit` in all.
    pub fn suggest(&self, query: &str, limit: usize) -> Vec<Suggestion> {
        let words = tokenise(query);
        let Some(last) = words.last() else {
            return Vec::new();
        };
        let mut out: Vec<Suggestion> = self
            .search(query)
            .into_iter()
            .take(limit.saturating_sub(2).max(1))
            .map(|hit| Suggestion::Recipe {
                title: self.title_of(&hit.id).to_owned(),
                id: hit.id,
            })
            .collect();

        let ingredient = |field: &u8| *field == Field::Item as u8 || *field == Field::Food as u8;
        let start = self
            .terms
            .partition_point(|t| t.term.as_str() < last.as_str());
        let mut completions: Vec<&IndexedTerm> = self.terms[start..]
            .iter()
            .take_while(|t| t.term.starts_with(last.as_str()))
            .filter(|t| t.term.len() > 2 && t.postings.iter().any(|(_, f)| ingredient(f)))
            .collect();
        // "tomato" and "tomatoes" are one suggestion: a plural goes when its singular is listed.
        let listed: Vec<&str> = completions.iter().map(|t| t.term.as_str()).collect();
        completions.retain(|t| {
            !["s", "es"].iter().any(|end| {
                t.term
                    .strip_suffix(end)
                    .is_some_and(|stem| listed.contains(&stem))
            })
        });
        completions.sort_by(|a, b| {
            b.postings
                .len()
                .cmp(&a.postings.len())
                .then(a.term.cmp(&b.term))
        });
        for term in completions {
            if out.len() >= limit {
                break;
            }
            out.push(Suggestion::Ingredient {
                term: term.term.clone(),
            });
        }

        // A word the index does not know was only matched loosely, if at all: offer the spelling.
        let corrected: Vec<String> = words.iter().map(|w| self.closest(w)).collect();
        if corrected != words {
            out.truncate(limit.saturating_sub(1));
            out.push(Suggestion::Correction {
                query: corrected.join(" "),
            });
        }
        out.truncate(limit);
        out
    }

    /// The word itself when the index knows it, else the most used term one edit away.
    fn closest(&self, word: &str) -> String {
        let known = |w: &str| {
            let at = self.terms.partition_point(|t| t.term.as_str() < w);
            self.terms.get(at).is_some_and(|t| t.term.starts_with(w))
        };
        if word.chars().count() < 4 || known(word) {
            return word.to_owned();
        }
        let chars: Vec<char> = word.chars().collect();
        self.terms
            .iter()
            .filter(|t| within_one_edit(&chars, &t.term.chars().collect::<Vec<_>>()))
            .max_by_key(|t| t.postings.len())
            .map_or_else(|| word.to_owned(), |t| t.term.clone())
    }

    fn title_of(&self, id: &str) -> &str {
        self.docs
            .iter()
            .find(|d| d.id == id)
            .map_or("", |d| d.title.as_str())
    }

    /// Ranks recipes by the share of their required ingredients that the cook already has.
    pub fn ingredients_i_have(&self, have: &[&str]) -> Vec<Coverage> {
        let phrases: Vec<Vec<String>> = have
            .iter()
            .map(|h| tokenise(h))
            .filter(|p| !p.is_empty())
            .collect();
        let mut out: Vec<Coverage> = self
            .docs
            .iter()
            .filter(|d| !d.ingredients.is_empty())
            .filter_map(|doc| {
                let matched = doc
                    .ingredients
                    .iter()
                    .filter(|tokens| phrases.iter().any(|p| covers(p, tokens)))
                    .count();
                (matched > 0).then(|| Coverage {
                    id: doc.id.clone(),
                    matched,
                    total: doc.ingredients.len(),
                    ratio: matched as f64 / doc.ingredients.len() as f64,
                })
            })
            .collect();
        out.sort_by(|a, b| {
            b.ratio
                .total_cmp(&a.ratio)
                .then(b.matched.cmp(&a.matched))
                .then_with(|| self.title_of(&a.id).cmp(self.title_of(&b.id)))
        });
        out
    }
}

fn covers(phrase: &[String], ingredient: &[String]) -> bool {
    phrase.iter().all(|word| {
        ingredient.iter().any(|token| {
            token == word
                || (word.len() >= 3 && token.starts_with(word.as_str()))
                || (token.len() >= 4 && word.starts_with(token.as_str()))
                || close_enough(word, token)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn summary(id: &str, title: &str, items: &[&str]) -> RecipeSummary {
        RecipeSummary {
            id: id.into(),
            title: title.into(),
            title_local: None,
            tags: vec![],
            section_path: vec!["First Courses".into()],
            ingredients: items
                .iter()
                .map(|i| SummaryIngredient {
                    item: (*i).into(),
                    food: None,
                    optional: false,
                })
                .collect(),
        }
    }

    fn index() -> SearchIndex {
        let mut brulee = summary(
            "desserts/brulee",
            "Crème brûlée",
            &["double cream", "egg yolks", "caster sugar"],
        );
        brulee.title_local = Some("Krema ħamra".into());
        brulee.tags = vec!["French Classics".into()];
        SearchIndex::build(&[
            summary(
                "pasta/carbonara",
                "Spaghetti carbonara",
                &["spaghetti", "eggs", "guanciale", "pecorino"],
            ),
            summary(
                "pasta/tomato",
                "Tomato pasta",
                &["spaghetti", "tomatoes", "basil"],
            ),
            summary(
                "soups/cream-of-tomato",
                "Cream of tomato",
                &["tomatoes", "double cream", "spaghetti"],
            ),
            brulee,
        ])
    }

    fn ids(hits: &[SearchHit]) -> Vec<&str> {
        hits.iter().map(|h| h.id.as_str()).collect()
    }

    #[test]
    fn accents_are_ignored_both_ways() {
        let index = index();
        assert_eq!(ids(&index.search("creme")), vec!["desserts/brulee"]);
        assert_eq!(ids(&index.search("BRÛLÉE")), vec!["desserts/brulee"]);
        assert_eq!(ids(&index.search("hamra")), vec!["desserts/brulee"]);
        assert_eq!(
            tokenise("Ċirkewwa għal żiemel"),
            vec!["cirkewwa", "ghal", "ziemel"]
        );
    }

    #[test]
    fn prefixes_and_typos() {
        let index = index();
        assert_eq!(ids(&index.search("carb")), vec!["pasta/carbonara"]);
        assert_eq!(ids(&index.search("carbonnara")), vec!["pasta/carbonara"]);
        assert_eq!(
            ids(&index.search("spagetti")).first(),
            Some(&"pasta/carbonara")
        );
        assert!(
            index.search("carx").is_empty(),
            "short words do not get typo tolerance"
        );
    }

    #[test]
    fn every_word_must_match() {
        let index = index();
        assert_eq!(
            ids(&index.search("tomato cream")),
            vec!["soups/cream-of-tomato"]
        );
        assert!(index.search("tomato cheese").is_empty());
        assert!(index.search("  ").is_empty());
    }

    #[test]
    fn title_hits_outrank_ingredient_hits() {
        let hits = index().search("spaghetti");
        assert_eq!(hits[0].id, "pasta/carbonara");
        assert!(hits[0].score > hits[1].score);
        assert_eq!(index().search("tomato").len(), 2);
    }

    #[test]
    fn tags_and_sections_are_searchable() {
        assert_eq!(ids(&index().search("french")), vec!["desserts/brulee"]);
        assert_eq!(index().search("first courses").len(), 4);
    }

    #[test]
    fn coverage_ranking() {
        let ranked = index().ingredients_i_have(&["spaghetti", "egg", "pecorino cheese"]);
        assert_eq!(ranked[0].id, "pasta/carbonara");
        assert_eq!((ranked[0].matched, ranked[0].total), (2, 4));
        let basil = index().ingredients_i_have(&["tomato", "basil"]);
        assert_eq!(basil[0].id, "pasta/tomato");
        assert!((basil[0].ratio - 2.0 / 3.0).abs() < 1e-9);
        assert!(index().ingredients_i_have(&["kryptonite"]).is_empty());
    }

    #[test]
    fn optional_ingredients_do_not_count() {
        let mut s = summary("a", "A", &["flour", "sugar"]);
        s.ingredients[1].optional = true;
        let ranked = SearchIndex::build(&[s]).ingredients_i_have(&["flour"]);
        assert_eq!(ranked[0].ratio, 1.0);
    }

    #[test]
    fn index_round_trips_through_json() {
        let json = serde_json::to_string(&index()).unwrap();
        let back: SearchIndex = serde_json::from_str(&json).unwrap();
        assert_eq!(back.search("carbonara").len(), 1);
        assert_eq!(back.len(), 4);
    }

    #[test]
    fn edit_distance_one() {
        let d = |a: &str, b: &str| {
            within_one_edit(
                &a.chars().collect::<Vec<_>>(),
                &b.chars().collect::<Vec<_>>(),
            )
        };
        assert!(
            d("pasta", "pasta")
                && d("pasta", "pastaa")
                && d("pasta", "pata")
                && d("pasta", "psata")
                && d("pasta", "pastu")
        );
        assert!(!d("pasta", "pizza") && !d("pasta", "past a x"));
    }

    #[test]
    fn suggestions_lead_with_recipes_then_complete_an_ingredient() {
        let found = index().suggest("tom", 6);
        assert!(matches!(&found[0], Suggestion::Recipe { .. }));
        let terms: Vec<&Suggestion> = found
            .iter()
            .filter(|s| matches!(s, Suggestion::Ingredient { .. }))
            .collect();
        assert_eq!(
            terms,
            [&Suggestion::Ingredient {
                term: "tomatoes".into()
            }]
        );
        assert!(found.len() <= 6);
        assert!(index().suggest("  ", 6).is_empty());
    }

    #[test]
    fn a_misspelt_query_gets_a_correction_after_its_matches() {
        let found = index().suggest("spagheti carbonarra", 6);
        assert!(matches!(&found[0], Suggestion::Recipe { id, .. } if id == "pasta/carbonara"));
        assert_eq!(
            found.last(),
            Some(&Suggestion::Correction {
                query: "spaghetti carbonara".into()
            })
        );
        assert!(index().suggest("zzzz", 6).is_empty());
        assert!(
            !index()
                .suggest("tomato", 6)
                .iter()
                .any(|s| matches!(s, Suggestion::Correction { .. }))
        );
    }
}
