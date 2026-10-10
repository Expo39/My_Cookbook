import { describe, expect, it } from 'vitest';
import type { Unit } from '$lib/types/recipe';
import {
	groupByAisle,
	groupByRecipe,
	lineKey,
	lineText,
	listText,
	mergeLines,
	normalise,
	type Convert,
	type ShoppingItem,
	type ShoppingRecipe
} from './shopping';

const FACTORS: Partial<Record<`${Unit}>${Unit}`, number>> = {
	'kg>g': 1000,
	'g>kg': 0.001,
	'l>ml': 1000,
	'ml>l': 0.001,
	'tbsp>ml': 15
};
const convert: Convert = (qty, from, to) => {
	const factor = FACTORS[`${from}>${to}`];
	return factor === undefined ? undefined : qty * factor;
};

const recipe = (id: string, items: ShoppingItem[]): ShoppingRecipe => ({
	id,
	title: id,
	serves: '4 servings',
	items
});
const flour = (qty: number, unit: Unit = 'g'): ShoppingItem => ({
	food: 'flour-00',
	item: 'plain flour',
	min: qty,
	max: qty,
	unit
});

describe('merging by food and by wording', () => {
	it('sums the same food in the same unit across recipes and remembers where it came from', () => {
		const lines = mergeLines([recipe('a', [flour(200)]), recipe('b', [flour(150)])], convert);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ min: 350, max: 350, unit: 'g' });
		expect(lines[0].recipes.map((from) => from.id)).toEqual(['a', 'b']);
		expect(lineText(lines[0])).toBe('350 g plain flour');
	});

	it('sums compatible units by converting into the first unit', () => {
		const lines = mergeLines([recipe('a', [flour(500)]), recipe('b', [flour(1, 'kg')])], convert);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ min: 1500, unit: 'g' });
	});

	it('keeps incompatible units on separate lines', () => {
		const egg = (qty: number, unit?: Unit): ShoppingItem => ({
			food: 'egg',
			item: 'eggs',
			min: qty,
			max: qty,
			unit: unit ?? null
		});
		const lines = mergeLines([recipe('a', [egg(2)]), recipe('b', [egg(100, 'g')])], convert);
		expect(lines).toHaveLength(2);
		expect(new Set(lines.map((line) => line.key)).size).toBe(2);
		expect(lines[0].key).toBe('food:egg');
	});

	it('does not convert at all when it has no converter', () => {
		const lines = mergeLines([recipe('a', [flour(500)]), recipe('b', [flour(1, 'kg')])]);
		expect(lines).toHaveLength(2);
	});

	it('adds ranges end to end', () => {
		const range = (min: number, max: number): ShoppingItem => ({
			item: 'sugar',
			min,
			max,
			unit: 'g'
		});
		const [line] = mergeLines([recipe('a', [range(50, 60)]), recipe('b', [range(100, 100)])]);
		expect(line).toMatchObject({ min: 150, max: 160 });
		expect(lineText(line)).toBe('150–160 g sugar');
	});

	it('merges lines with no food id by wording and unit, ignoring case, accents and plurals', () => {
		const lines = mergeLines([
			recipe('a', [{ item: 'Free-range Eggs', min: 2, max: 2, unit: null }]),
			recipe('b', [{ item: 'free range egg', min: 3, max: 3, unit: null }]),
			recipe('c', [{ item: 'free range egg', min: 100, max: 100, unit: 'g' }])
		]);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ min: 5, unit: null });
	});

	it('keeps a prefix such as "zest of" apart from the plain ingredient', () => {
		const lemon: ShoppingItem = { food: 'lemon', item: 'lemon', min: 1, max: 1, unit: null };
		const zest = { ...lemon, prefix: 'Zest of' };
		const lines = mergeLines([recipe('a', [lemon]), recipe('b', [zest]), recipe('c', [zest])]);
		expect(lines).toHaveLength(2);
		expect(lineText(lines[1])).toBe('Zest of 2 lemon');
	});

	it('gives a quantity to a line that began as "to taste"', () => {
		const lines = mergeLines([
			recipe('a', [{ food: 'salt', item: 'salt' }]),
			recipe('b', [{ food: 'salt', item: 'salt', min: 1, max: 1, unit: 'tsp' }])
		]);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ min: 1, unit: 'tsp' });
		expect(lines[0].recipes).toHaveLength(2);
	});

	it('counts a recipe once on a line even if it names the food twice', () => {
		const [line] = mergeLines([recipe('a', [flour(100), flour(50)])]);
		expect(line.recipes).toHaveLength(1);
		expect(line.min).toBe(150);
	});
});

describe("merged amounts stay in the reader's unit system", () => {
	const spoons = (qty: number, unit: Unit): ShoppingItem => ({
		item: 'Dijon mustard',
		food: 'mustard',
		min: qty,
		max: qty,
		unit
	});
	const two = [recipe('a', [spoons(2.5, 'tbsp')]), recipe('b', [spoons(2.5, 'tbsp')])];

	it('sums spoons as spoons in metric, never stepping up to cups', () => {
		const [line] = mergeLines(two, convert, 'metric');
		expect(lineText(line)).toBe('5 tbsp Dijon mustard');
		const [big] = mergeLines([recipe('a', [spoons(8, 'tbsp')])], convert, 'metric');
		expect(big.unit).toBe('tbsp');
	});

	it('steps up to cups in the US system from a quarter cup', () => {
		const [five] = mergeLines(two, convert, 'us');
		expect(lineText(five)).toBe('⅓ cup Dijon mustard');
		const [few] = mergeLines([recipe('a', [spoons(2, 'tbsp')])], convert, 'us');
		expect(few.unit).toBe('tbsp');
	});

	it('adds a cup and a tablespoon and shows metric in tablespoons', () => {
		const [line] = mergeLines(
			[recipe('a', [spoons(0.25, 'cup')]), recipe('b', [spoons(1, 'tbsp')])],
			convert,
			'metric'
		);
		expect(lineText(line)).toBe('5 tbsp Dijon mustard');
	});

	it('shows small amounts in teaspoons', () => {
		const [line] = mergeLines([recipe('a', [spoons(1, 'tsp')]), recipe('b', [spoons(1, 'tsp')])]);
		expect(lineText(line)).toBe('2 tsp Dijon mustard');
	});

	it('turns ounces into grams in metric but leaves them in US', () => {
		const oz = (qty: number): ShoppingItem => ({ item: 'cheese', min: qty, max: qty, unit: 'oz' });
		const toGrams: Convert = (qty, from, to) =>
			from === 'oz' && to === 'g' ? qty * 28 : undefined;
		const [metric] = mergeLines([recipe('a', [oz(2)])], toGrams, 'metric');
		expect(metric).toMatchObject({ unit: 'g', min: 56 });
		const [us] = mergeLines([recipe('a', [oz(2)])], toGrams, 'us');
		expect(us.unit).toBe('oz');
	});
});

describe('keys and wording', () => {
	it('uses the food id when there is one, and the wording plus unit when there is not', () => {
		expect(lineKey(flour(1))).toBe('food:flour-00');
		expect(lineKey({ item: 'Spring onions', unit: 'g' })).toBe('text:spring onion|g');
	});

	it('singularises crudely but leaves short words and double s alone', () => {
		expect(normalise('Tomatoes, Peas')).toBe('tomato pea');
		expect(normalise('glass gas')).toBe('glass gas');
	});
});

describe('groups', () => {
	const recipes = [
		recipe('a', [
			flour(100),
			{ item: 'beef fillet', min: 1, max: 1, unit: 'kg' },
			{ item: 'thyme', min: 1, max: 1, unit: 'tsp' }
		]),
		recipe('b', [flour(100), { item: 'chicken stock', min: 1, max: 1, unit: 'l' }])
	];

	it('groups merged lines by type in a fixed order, with a catch-all last', () => {
		const lines = mergeLines([
			...recipes,
			recipe('c', [{ item: 'mystery thing', min: 1, max: 1, unit: null }])
		]);
		const groups = groupByAisle(lines);
		expect(groups.map((group) => group.id)).toEqual(['cupboard', 'herbs', 'meat', 'other']);
		expect(groups[0].lines.map((line) => line.item)).toEqual(['plain flour', 'chicken stock']);
	});

	it('groups by recipe without merging across recipes', () => {
		const groups = groupByRecipe(recipes);
		expect(groups.map((group) => group.label)).toEqual(['a (4 servings)', 'b (4 servings)']);
		expect(groups[0].lines).toHaveLength(3);
	});

	it('leaves ticked lines out of the shared text', () => {
		const groups = groupByAisle(mergeLines(recipes));
		const text = listText(groups, new Set(['food:flour-00']));
		expect(text).toContain('- 1 l chicken stock');
		expect(text).not.toContain('flour');
		expect(text.startsWith('Shopping list')).toBe(true);
	});
});
