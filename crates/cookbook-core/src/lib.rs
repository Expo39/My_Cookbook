//! Schema, scaling, units, ingredient parsing, search and the recipe checklist.
//! This crate does no IO, so it compiles for `wasm32-unknown-unknown`.

pub mod checklist;
pub mod format;
pub mod parse;
pub mod scale;
pub mod schema;
pub mod search;
pub mod tokens;
pub mod units;

pub use checklist::{
    CheckContext, CheckResult, Collection, Level, RecipeFile, SectionFile, check_all, check_recipe,
    check_removal, has_errors,
};
pub use format::{DisplayCtx, Shown, display_amount, format_minutes, format_number, round_amount};
pub use parse::{IngredientParseError, parse_ingredient_line};
pub use scale::{
    ScaleOptions, ScaleRequest, ScaledAmount, ScaledGroup, ScaledIngredient, ScaledRecipe,
    ScaledStep, Warning, apply_variants, factor_for, scale,
};
pub use schema::{
    Amount, Difficulty, Image, Ingredient, IngredientGroup, Pan, PanShape, Qty, QtyRange, Recipe,
    ScaleMode, Scaling, Section, Step, StepTime, Times, Unit, Variant, VariantOption, parse_recipe,
    parse_section,
};
pub use search::{Coverage, RecipeSummary, SearchHit, SearchIndex, SummaryIngredient, tokenise};
pub use tokens::{RenderedSegment, Segment, parse_tokens, render_segments, render_text};
pub use units::{
    Density, Dimension, TempKind, UnitSystem, convert, density, fahrenheit, gas_mark, normalise,
    toggle_unit,
};
