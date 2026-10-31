# How to write a recipe for Antonio's cookbook

These are the house rules for turning a recipe into the cookbook's JSON. The in-site importer gives them to Gemini word for word, and the `add-recipe` skill follows them too, so a recipe reads the same however it was added. Follow every rule exactly. When a rule says "never", there is no exception.

## The golden rule

Copy everything the recipe gives, and nothing it does not.

- Every amount written in the source must appear in the JSON, attached to its ingredient. If the source writes "200g plain flour", the object for plain flour has `"amount": { "qty": 200, "unit": "g" }`. Losing an amount is the worst mistake you can make.
- Every ingredient, step, time and temperature in the source must appear too.
- Make up nothing: no ingredient, amount, step, time or tip that the text does not write. When the source gives no amount for an ingredient ("salt", "olive oil for frying"), that ingredient has no `amount`.

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
- Ranges: only a count takes a range, as `{ "qty": { "min": 2, "max": 3 } }` for "2-3 cloves garlic". A weight or a volume never takes a range: use the middle of it, so "100-150 g sugar" becomes `{ "qty": 125, "unit": "g" }`, and add a tip saying that amount is a guide. Time ranges in the method stay ranges (see the method).
- `prefix`: words before the amount that are not the ingredient, always in the same object as the ingredient: "Zest of 1 lemon" is `prefix` "Zest of", `amount` `{ "qty": 1 }`, `item` "lemon". "Zest and juice of 2 lemons" is one object: `prefix` "Zest and juice of", `amount` `{ "qty": 2 }`, `item` "lemons".
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
| `2 x 400g tins chopped tomatoes` | `{ "amount": { "qty": 2 }, "item": "tins of chopped tomatoes", "note": "400 g each", "scale": "discrete" }` |
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
- `{@key}` tokens: use one only when a step repeats an ingredient's amount with its number, as in "Add 200 g of the sugar." Then give that ingredient a short lowercase `key` ("sugar") and write "Add {@sugar}." For half of it, `{@sugar*1/2}`; for the amount alone, `{@sugar:amount}`. When a step does not repeat a number, do not use a token and do not give the ingredient a key: "Heat the oil and add the butter" stays exactly "Heat the oil and add the butter." Most recipes need no tokens at all.
- `heading`: when the method has stages ("Day 1", "Make the sauce", "To assemble"), put `heading` on the first step of each stage.
- Never add a step the source does not have, such as "Serve and enjoy" or "Preheat the oven" when the source does not say it.

## Times and the rest

- `times`: `prep`, `cook` and `rest`, in whole minutes, copied only from a line of the source that names them, such as "Prep: 20 mins" or "Cook time: 1 hour". Never work a time out from the method: a step that says "cool for 10 minutes" is not a `rest` time. When the source names prep and cook, include both.
- `difficulty`: `easy`, `medium` or `hard`, only when the source says it.
- `tips`: the source's own notes, substitutions, storage and serving ideas, each one sentence or two. The only tip you may add yourself is the one the amounts rule asks for, when a weight or volume range became its middle. Never add a tip about a time range or anything else.
- `origin`: only when the text names where the recipe comes from (a website, a book, a person), written as "Adapted from <name>". Never guess a source.
- `tags`: only when the source lists categories or the dish's cuisine is stated; short words such as "Italian", "Vegetarian".
- Leave out every field you have no value for. Never write an empty string, `null` or a placeholder such as "unknown".
