//! The legacy `id` of every recipe in `index.html`, with its new recipe id and the
//! original servings from `js/config.js`. This module has no dependencies so that the
//! golden test can include it directly.

/// The legacy charcuterie board has no method, but a recipe needs one step. This is the
/// wording of its own chef's tip, to be replaced in the copy-editing pass.
pub const NO_METHOD_STEP: &str = "Arrange items in clusters rather than rows for visual appeal.";

pub struct LegacyRecipe {
    pub legacy: &'static str,
    /// The new recipe id: the file path under `recipes/`, without the extension.
    pub id: &'static str,
    pub servings: u32,
}

pub const LEGACY_RECIPES: &[LegacyRecipe] = &[
    LegacyRecipe {
        legacy: "charcuterie",
        id: "first-courses/platters/charcuterie-board-for-10",
        servings: 10,
    },
    LegacyRecipe {
        legacy: "pasta1",
        id: "first-courses/pasta/one-pot-pasta-with-fresh-tomatoes",
        servings: 4,
    },
    LegacyRecipe {
        legacy: "pasta2",
        id: "first-courses/pasta/sicilian-style-tuna-pasta",
        servings: 2,
    },
    LegacyRecipe {
        legacy: "pasta3",
        id: "first-courses/pasta/creamy-steak-pasta",
        servings: 4,
    },
    LegacyRecipe {
        legacy: "pasta4",
        id: "first-courses/pasta/creamy-pancetta-mushroom-tagliatelle",
        servings: 3,
    },
    LegacyRecipe {
        legacy: "gnocchi",
        id: "first-courses/pasta/baked-gnocchi-with-tomato-mozzarella",
        servings: 4,
    },
    LegacyRecipe {
        legacy: "korean",
        id: "main-courses/rice-grain-bowls/korean-ground-beef-bowl",
        servings: 3,
    },
    LegacyRecipe {
        legacy: "katsu",
        id: "main-courses/rice-grain-bowls/chicken-katsu-curry",
        servings: 2,
    },
    LegacyRecipe {
        legacy: "cotechino",
        id: "main-courses/pork/cotechino-with-lentils",
        servings: 4,
    },
    LegacyRecipe {
        legacy: "porchetta",
        id: "main-courses/pork/tonis-porchetta",
        servings: 6,
    },
    LegacyRecipe {
        legacy: "lamb",
        id: "main-courses/lamb/pistachio-crusted-rack-of-lamb",
        servings: 2,
    },
    LegacyRecipe {
        legacy: "ribeye",
        id: "main-courses/beef-steak/pan-seared-ribeye-steak",
        servings: 1,
    },
    LegacyRecipe {
        legacy: "fillet",
        id: "main-courses/beef-steak/pan-seared-fillet-steak",
        servings: 1,
    },
    LegacyRecipe {
        legacy: "wellington",
        id: "main-courses/beef-steak/beef-wellington",
        servings: 5,
    },
    LegacyRecipe {
        legacy: "shortribs",
        id: "main-courses/beef-steak/braised-beef-short-ribs",
        servings: 4,
    },
    LegacyRecipe {
        legacy: "soup",
        id: "soups/roasted-tomato-basil-soup",
        servings: 10,
    },
    LegacyRecipe {
        legacy: "brulee",
        id: "desserts/french-classics/creme-brulee",
        servings: 4,
    },
    LegacyRecipe {
        legacy: "crepes",
        id: "desserts/french-classics/savoury-crepes",
        servings: 5,
    },
    LegacyRecipe {
        legacy: "asparagus",
        id: "sides/orange-asparagus",
        servings: 5,
    },
];

pub fn lookup(legacy: &str) -> Option<&'static LegacyRecipe> {
    LEGACY_RECIPES.iter().find(|r| r.legacy == legacy)
}
