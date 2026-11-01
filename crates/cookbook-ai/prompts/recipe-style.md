# How to write a recipe for Antonio's cookbook

These are the house rules for turning a recipe into the cookbook's JSON. The in-site importer gives them to Gemini word for word, and the `add-recipe` skill follows them too, so a recipe reads the same however it was added. Follow every rule exactly. When a rule says "never", there is no exception.

## The golden rule

Copy everything the recipe gives, and nothing it does not.

- Every amount written in the source must appear in the JSON, attached to its ingredient. If the source writes "200g plain flour", the object for plain flour has `"amount": { "qty": 200, "unit": "g" }`. Losing an amount is the worst mistake you can make.
- Every ingredient, step, time and temperature in the source must appear too.
- Make up nothing: no ingredient, amount, step, time or tip that the text does not write.
- Copying means copying the content, not the form. However the source writes it (imperial units, equivalents in brackets, amounts in the method, hob settings), convert it to the rules below: each amount once, in the ingredient's `amount`, and words everywhere else. When the source gives no amount for an ingredient ("salt", "olive oil for frying"), that ingredient has no `amount`.

## Work in this order

1. Read the whole text once before writing anything.
2. Find the title, the number of servings, the ingredient list (and any parts, such as "For the sauce") and the method.
3. Ignore everything that is not the recipe: stories, adverts, comments, nutrition tables, links, "jump to recipe", ratings.
4. Write the ingredients in the source's order. For each one, first write its `amount` from the number in front of it, then its `item`, then anything else.
5. Write the method, one step per instruction of the source, in the source's order.
6. Add the times, tips and other fields only when the text gives them.
7. Check: count the numbers in front of ingredients in the source. Every one of them must be an `amount` in your JSON. Then check every rule below.

## Language

- British English: "flavour", "colour", "centre", "grill", "courgette", "aubergine", "coriander", "double cream", "plain flour", "caster sugar", "tin" (not "can"), "hob" (not "stovetop").
- Steps are short commands with articles: "Heat the oil in a large pan." not "Heat oil in large pan." and not "You will want to heat the oil."
- No exclamation marks. No filler words: never write "simply", "just", "easy", "perfect", "delicious", "amazing" or "enjoy".
- Keep the source's meaning; tidy only the wording.

## Title, summary and servings

- `title`: the dish's name in English, in title case, without "The best", "Easy" or "Recipe". Example: "Pastizzi Tal-Irkotta" stays as given; "THE BEST Easy Lemon Tart Recipe!!" becomes "Lemon Tart".
- `titleLocal`: only when the source gives a Maltese or Italian name that differs from `title`. Otherwise leave it out.
- `summary`: one or two plain sentences, at most 200 characters, saying what the dish is. Example: "A sharp, bright tart with a crisp base. Make it a day ahead." Anything longer goes into `tips`.
- `servings`: the number of servings the source states. If it gives a range ("serves 4-6"), use the lower number. If it says nothing, use 4.

## Ingredients

Each ingredient is one object in `items`. Every object has an `item`, the ingredient's name, and an object never holds only an amount or only a prefix. When the source writes a number before the ingredient, the object must have an `amount` with that number, whatever other fields it has.

### One ingredient, one object

- Each ingredient of the source becomes exactly one object, with its name and its amount together. Never split one ingredient into two objects, for example one with the name and one with the amount.
- A line that lists several ingredients becomes one object for each of them, each with its own amount: "1 onion, 1 carrot and 1 celery stick, finely chopped" is three objects.
- Ingredients written in a sentence or after a colon ("Pastry: 200g plain flour, 100g cold butter, 50g icing sugar") are one object each, with the amount written beside each name. Never drop an amount the source gives.
- Do not repeat the part's name in `note`: in the group "Pastry", a note "for the pastry" is wrong.

### The fields

- `item`: the ingredient's name, lowercase unless it is a proper noun: "plain flour", "Parmesan", "egg yolks". The name only; preparation goes in `note`. Use the British name for these American ones, and change no other name: "all-purpose flour" is "plain flour", "baking soda" is "bicarbonate of soda" (baking powder stays "baking powder"), "powdered sugar" or "confectioners' sugar" is "icing sugar", "superfine sugar" is "caster sugar", "heavy cream" is "double cream", "cilantro" is "coriander", "zucchini" is "courgette", "eggplant" is "aubergine", "scallions" are "spring onions", "ground beef" is "beef mince".
- `note`: preparation or state, written after a comma in the source: "finely chopped", "at room temperature", "melted". Do not repeat a word that is already in `item`.
- `amount`: `{ "qty": <number>, "unit": "<unit>" }`.
  - `unit` is exactly one of: `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, `oz`, `lb`, `floz`, `pinch`. Write "grams" as `g`, "teaspoon" as `tsp`, "tablespoon" as `tbsp`, "fluid ounces" as `floz`.
  - A count has no `unit`: "3 eggs" is `{ "qty": 3 }` with `item` "eggs".
  - Fractions become decimals: "½ tsp" is `0.5`; "1 1/2 cups" is `1.5`; "1/3 cup" is `0.33`; "half a pumpkin" is `0.5` with `item` "pumpkin".
  - Keep the source's units. Do not convert between metric and imperial yourself.
- Ranges: only a count takes a range, as `{ "qty": { "min": 2, "max": 3 } }` for "2-3 cloves garlic". A weight or a volume never takes a range: use the middle of it, so "100-150 g sugar" becomes `{ "qty": 125, "unit": "g" }`, with no tip about it. Time ranges in the method stay ranges (see the method).
- `prefix`: words before the amount that are not the ingredient, always in the same object as the ingredient: "Zest of 1 lemon" is `prefix` "Zest of", `amount` `{ "qty": 1 }`, `item` "lemon". "Zest and juice of 2 lemons" is one object: `prefix` "Zest and juice of", `amount` `{ "qty": 2 }`, `item` "lemons".
- Numbers live only in `amount`. `item`, `note` and `prefix` never hold a number, because only the amount changes with the servings and can be switched to other units:
  - A weight or count written beside another amount ("1 tin (400 g)", "1 large onion, about 200 g", "10 g garlic, 2-3 cloves", "1 packet") keeps one amount, the one the list is in, and the other goes in a tip as a reference only if it helps: "1 large onion is about 180 g", "A tin of coconut milk is 400 ml".
  - A size to cut to ("cut into 4 cm chunks") goes in the method step that does the cutting, and the note says only "cut into chunks". A thickness that the cooking times depend on ("a steak 2 cm thick") goes in a tip: "These timings are for a steak about 2 cm thick."
  - "Per person" figures ("400 g per person") are left out: the servings already do that.
  - Never write `alt`, the equivalent in other units in brackets: the reader switches units on the page.
- No amount: "Salt, to taste" has no `amount`, `item` "salt", and `"scale": "toTaste"`. "Olive oil, for frying" has no `amount`, `item` "olive oil", `note` "for frying". "A handful of soaked beans" has no `amount`, `item` "beans", `note` "a handful, soaked overnight".
- `optional`: `true` only when the source says "optional", "if you like" or "if you find it"; then leave those words out of the name and the note.
- `scale`, how the amount changes with the servings. Most ingredients have no `scale` at all.
  - `discrete` for whole things that cannot be cut: eggs, garlic cloves, onions, lemons, tins, slices, sheets.
  - `seasoning` for salt, pepper, dried herbs and ground spices that have an amount.
  - `toTaste` for any line that says "to taste" or has no amount and is salt, pepper or a seasoning.
  - `fixed` only when the source says the amount does not change with the servings, such as "per ramekin" or "1 bay leaf, whatever the size". Never use `fixed` for flour, butter, oil, sugar, milk or any main ingredient.
  - Leave `scale` out for everything else.
- `food`: set it only when the ingredient is exactly one of these, otherwise leave it out: flour, flour-00, flour-plain, flour-self-raising, flour-bread, flour-wholemeal, cornflour, semolina, sugar, sugar-caster, sugar-granulated, sugar-brown, sugar-icing, butter, milk, water, cream, yoghurt, olive-oil, oil, honey, rice, couscous, lentils, oats, cocoa, salt, breadcrumbs, ground-almonds. `food` goes in the same object as the ingredient's name and amount.
- Parts: when the source splits the ingredients ("For the base", "Pastry:", "To assemble"), make one group per part with `name` "Base", "Pastry", "To assemble". When it does not, make one group with no `name`.

### Line by line

Each source line on the left becomes exactly the objects on the right.

| Source | Objects |
|---|---|
| `400g rigatoni` | `{ "amount": { "qty": 400, "unit": "g" }, "item": "rigatoni" }` |
| `1/3 cup melted butter` | `{ "food": "butter", "amount": { "qty": 0.33, "unit": "cup" }, "item": "butter", "note": "melted" }` |
| `2-3 cloves garlic, crushed` | `{ "amount": { "qty": { "min": 2, "max": 3 } }, "item": "garlic cloves", "note": "crushed", "scale": "discrete" }` |
| `1 onion, 1 carrot and 1 celery stick, finely chopped` | `{ "amount": { "qty": 1 }, "item": "onion", "note": "finely chopped", "scale": "discrete" }`, `{ "amount": { "qty": 1 }, "item": "carrot", "note": "finely chopped", "scale": "discrete" }`, `{ "amount": { "qty": 1 }, "item": "celery stick", "note": "finely chopped", "scale": "discrete" }` |
| `Pastry: 200g plain flour, 100g cold butter` | in the group "Pastry": `{ "food": "flour-plain", "amount": { "qty": 200, "unit": "g" }, "item": "plain flour" }`, `{ "food": "butter", "amount": { "qty": 100, "unit": "g" }, "item": "butter", "note": "cold" }` |
| `zest and juice of 2 lemons` | `{ "prefix": "Zest and juice of", "amount": { "qty": 2 }, "item": "lemons", "scale": "discrete" }` |
| `2 sprigs thyme` | `{ "amount": { "qty": 2 }, "item": "sprigs of thyme", "scale": "discrete" }` (a counting word such as sprigs, slices, sheets, cloves or tins stays in `item`) |
| `2 x 400g tins chopped tomatoes` | `{ "amount": { "qty": 800, "unit": "g" }, "item": "chopped tomatoes", "note": "tinned" }` |
| `1 large onion (about 200 g), diced` | `{ "amount": { "qty": 1 }, "item": "large onion", "note": "diced", "scale": "discrete" }`, and the tip "1 large onion is about 200 g." |
| `Salt and pepper to taste` | `{ "item": "salt and pepper", "scale": "toTaste" }` |
| `a handful of beans soaked overnight` | `{ "item": "beans", "note": "a handful, soaked overnight" }` |
| `1 tsp baking soda` | `{ "amount": { "qty": 1, "unit": "tsp" }, "item": "bicarbonate of soda" }` |
| `1 tsp baking powder` | `{ "amount": { "qty": 1, "unit": "tsp" }, "item": "baking powder" }` (baking powder is not bicarbonate of soda; it keeps its name) |
| `200g self raising flour` | `{ "food": "flour-self-raising", "amount": { "qty": 200, "unit": "g" }, "item": "self-raising flour" }` |
| `300ml milk` | `{ "food": "milk", "amount": { "qty": 300, "unit": "ml" }, "item": "milk" }` |
| `Fresh basil, to serve (optional)` | `{ "item": "fresh basil", "note": "to serve", "optional": true }` |

## The method

Each instruction is one object in `steps`, with its words in `text`.

- One step per instruction of the source. Split a step only where the source starts a new action and it is very long.
- Name the ingredients plainly in the step: "Add the onions and the garlic." The cookbook works out which ingredients each step uses from these words, so use the same names as the ingredient list.
- Times become timers: "simmer for 20 minutes" is "simmer for {timer:20}". Ranges: `{timer:20-25}`. Hours: `{timer:2h}`, or `{timer:90}` for an hour and a half. Seconds: `{timer:30s}`. Keep the source's numbers exactly.
- Temperatures become `{temp:...}` in Celsius. Only a number written with °C, °F, C, F or "degrees" is a temperature; a size such as "23cm tin" or "4x8 inch pan" stays exactly as written.
- Oven temperatures:
  - "200°C" is `{temp:200}`.
  - "200°C (180°C fan)" is `{temp:200/180}`.
  - A fan temperature alone: add 20 for the conventional one, so "180°C fan" is `{temp:200/180}`.
  - Fahrenheit only: convert to the nearest 10 °C, so "350°F" is `{temp:180}`.
  - A temperature inside the food (meat, sugar, oil) takes `!`: "until it reaches 63°C" is "until it reaches {temp:63!}".
- Never repeat an ingredient's amount in a step: the ingredient list already gives it, and a number written in a step would not follow the servings. Name the ingredient instead: "Warm 1 tbsp olive oil" becomes "Warm the olive oil". When a step uses only part of an ingredient, say so in words: "Heat half the olive oil", "Add about two-thirds of the butter", "Add the rest of the butter". Do not write `{@key}` tokens and do not give ingredients a `key`. An amount of something that is not in the ingredient list, such as "add 100 ml of the pasta water", stays as written.
- `heading`: when the method has stages ("Day 1", "Make the sauce", "To assemble"), put `heading` on the first step of each stage.
- Heat is named in words only: low, medium-low, medium, medium-high or high. Never a hob setting such as "5 of 9".
- When the method keeps pasta or cooking water ("reserve a cup of the pasta water"), the list has it as an ingredient with no amount: `{ "item": "pasta water", "note": "reserved" }`, and the step says how much in words: "a mugful", "a splash at a time".
- Never add a step the source does not have, such as "Serve and enjoy" or "Preheat the oven" when the source does not say it.

## Times and the rest

- `times`: `prep`, `cook` and `rest`, in whole minutes, copied only from a line of the source that names them, such as "Prep: 20 mins" or "Cook time: 1 hour". Never work a time out from the method: a step that says "cool for 10 minutes" is not a `rest` time. When the source names prep and cook, include both.
- `difficulty`: `easy`, `medium` or `hard`, only when the source says it.
- `tips`: the source's own notes, substitutions, storage and serving ideas, each one sentence or two. A tip never repeats an amount from the ingredient list or gives a range for it (it would not change with the servings), and never lays out a cooking timeline. A number in a tip is only a reference guide that the list cannot give: "1 large onion is about 200 g", "For a 1 kg fillet you need about 10 crepes". The only tip you may add yourself is such a reference, when the rules above move a weight or count out of the ingredient's words. Never add a tip about a time range or anything else.
- `origin`: only when the text names where the recipe comes from (a website, a book, a person), written as "Adapted from <name>". Never guess a source.
- `tags`: only when the source lists categories or the dish's cuisine is stated; short words such as "Italian", "Vegetarian".
- Leave out every field you have no value for. Never write an empty string, `null` or a placeholder such as "unknown".
