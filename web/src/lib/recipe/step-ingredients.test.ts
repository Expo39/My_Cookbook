import { describe, expect, it } from 'vitest';
import type { RenderedSegment, ScaledGroup, ScaledIngredient, ScaledStep } from '$lib/types/recipe';
import { stem, stepIngredients } from './step-ingredients';

const line = (item: string, key?: string): ScaledIngredient => ({
	item,
	key,
	text: item,
	mode: 'linear',
	optional: false,
	scaled: false,
	toTaste: false
});

const group = (name: string | null, ...items: ScaledIngredient[]): ScaledGroup => ({ name, items });

const step = (...segments: (string | RenderedSegment)[]): ScaledStep => ({
	text: '',
	segments: segments.map((segment) =>
		typeof segment === 'string' ? { type: 'text', text: segment } : segment
	)
});

const used = (s: ScaledStep, groups: ScaledGroup[]) =>
	stepIngredients([s], groups)[0].map((entry) => entry.item.item);

const wellington = [
	group(
		null,
		line('chateaubriand beef fillet'),
		line('Olive oil'),
		line('Dijon mustard'),
		line('mushrooms'),
		line('Fresh thyme'),
		line('slices Parma ham'),
		line('puff pastry'),
		line('egg yolks'),
		line('Beef trimmings'),
		line('shallots'),
		line('red wine'),
		line('beef stock')
	)
];

describe('stem', () => {
	it('folds the common plurals onto one form', () => {
		expect(['shallots', 'tomatoes', 'berries', 'radishes', 'glass'].map(stem)).toEqual([
			'shallot',
			'tomato',
			'berry',
			'radish',
			'glass'
		]);
	});
});

describe('stepIngredients', () => {
	it('finds the lines a step names by their main word, plurals and all', () => {
		const sauce = step(
			'For the red wine sauce, roast the beef trimmings, add the chopped shallots and deglaze ' +
				'with the red wine. Reduce by half, then add the beef stock and simmer.'
		);
		expect(used(sauce, wellington)).toEqual([
			'Beef trimmings',
			'shallots',
			'red wine',
			'beef stock'
		]);
	});

	it('does not take a shared word such as "beef" as every beef line', () => {
		const sear = step(
			'Sear the beef fillet all over in a hot pan with olive oil, until golden. Brush with the Dijon mustard.'
		);
		expect(used(sear, wellington)).toEqual([
			'chateaubriand beef fillet',
			'Olive oil',
			'Dijon mustard'
		]);
	});

	it('takes a word only one line has, such as "egg" for the egg yolks', () => {
		expect(used(step('Brush the pastry with beaten egg.'), wellington)).toEqual([
			'puff pastry',
			'egg yolks'
		]);
	});

	it('looks past counting words: slices of ham, cloves of garlic, but ground cloves are cloves', () => {
		const groups = [
			group(null, line('slices Parma ham'), line('garlic cloves'), line('ground cloves'))
		];
		expect(used(step('Lay the ham over the crushed garlic.'), groups)).toEqual([
			'slices Parma ham',
			'garlic cloves'
		]);
		expect(used(step('Add a pinch of cloves.'), groups)).toEqual(['ground cloves']);
	});

	it('needs the whole name for a general word, so a sauce is not the soy sauce', () => {
		const groups = [group(null, line('soy sauce'), line('curry powder'))];
		expect(used(step('Make the sauce.'), groups)).toEqual([]);
		expect(used(step('Stir in the soy sauce and the curry powder.'), groups)).toEqual([
			'soy sauce',
			'curry powder'
		]);
	});

	it('splits "salt and pepper" into two foods', () => {
		const groups = [group(null, line('Salt and black pepper'))];
		expect(used(step('Season with pepper.'), groups)).toEqual(['Salt and black pepper']);
	});

	it('gives a line two parts share to the part the cook is working on', () => {
		const groups = [
			group('Coating', line('plain flour'), line('panko breadcrumbs')),
			group('Sauce', line('plain flour'), line('butter'))
		];
		const steps = [
			step('Coat the chicken in flour, then breadcrumbs.'),
			step('Melt the butter.'),
			step('Stir in the flour.')
		];
		const found = stepIngredients(steps, groups).map((entries) =>
			entries.map((entry) => `${entry.groupName}: ${entry.item.item}`)
		);
		expect(found).toEqual([
			['Coating: plain flour', 'Coating: panko breadcrumbs'],
			['Sauce: butter'],
			['Sauce: plain flour']
		]);
	});

	it('names a food packed in something by the food: tuna in olive oil is tuna', () => {
		const groups = [group(null, line('tuna in olive oil'), line('extra virgin olive oil'))];
		expect(used(step('Heat the olive oil.'), groups)).toEqual(['extra virgin olive oil']);
		expect(used(step('Add the tuna.'), groups)).toEqual(['tuna in olive oil']);
	});

	it('tells lines with the same main word apart by the word before it', () => {
		const groups = [group(null, line('large onions'), line('spring onions'), line('curry powder'))];
		expect(used(step('For the curry, cook the onions.'), groups)).toEqual(['large onions']);
		expect(used(step('Scatter over the spring onions.'), groups)).toEqual(['spring onions']);
	});

	it("keeps a step's own ingredient tokens, and does not match words inside them", () => {
		const groups = [group(null, line('vanilla extract', 'vanilla'), line('double cream'))];
		const s = step('Stir in ', {
			type: 'ingredient',
			key: 'vanilla',
			scaled: false,
			text: '2 tsp vanilla extract'
		});
		expect(used(s, groups)).toEqual(['vanilla extract']);
		expect(used(step('Heat the cream.'), groups)).toEqual(['double cream']);
	});

	it('ignores accents', () => {
		const groups = [group(null, line('crème fraîche'))];
		expect(used(step('Fold in the creme fraiche.'), groups)).toEqual(['crème fraîche']);
	});
});
