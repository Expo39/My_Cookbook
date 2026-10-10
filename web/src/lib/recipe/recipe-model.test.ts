// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, scaleRecipe, type Recipe, type RecipeData } from '$lib/core';
import { RecipeModel } from './recipe-model.svelte';

const recipe: Recipe = {
	title: 'Custard',
	summary: 'Set custard.',
	servings: 4,
	ingredientGroups: [
		{
			items: [
				{ key: 'cream', amount: { qty: 500, unit: 'ml' }, item: 'cream' },
				{ amount: { qty: 250, unit: 'g' }, item: 'sugar' },
				{ key: 'vanilla', amount: { qty: 2, unit: 'tsp' }, item: 'vanilla extract' }
			]
		}
	],
	steps: [{ key: 'infuse', text: 'Stir in {@vanilla}.' }],
	variants: [
		{
			key: 'vanilla',
			label: 'Vanilla',
			options: [
				{ key: 'extract', label: 'Extract', default: true },
				{
					key: 'pods',
					label: 'Pods',
					ingredients: { vanilla: { amount: { qty: 1 }, item: 'vanilla pod' } },
					steps: { infuse: 'Split the {@vanilla}.' }
				}
			]
		}
	]
};

const data: RecipeData = {
	recipe,
	related: [],
	section: ['Desserts'],
	view: undefined as never
};

const make = () => {
	const model = new RecipeModel({ ...data, view: scaleRecipe(recipe) }, () => 'metric');
	model.ready = true;
	return model;
};

beforeAll(async () => {
	await loadCore(readFileSync(new URL('../wasm/cookbook_wasm_bg.wasm', import.meta.url)));
});

describe('the recipe model', () => {
	it('starts as the written recipe', () => {
		const model = make();
		expect(model.scaled).toBe(false);
		expect(model.view.servings).toBe(4);
	});

	it('steps the servings one whole number at a time', () => {
		const model = make();
		model.step(1);
		expect(model.view.servings).toBe(5);
		expect(model.scaled).toBe(true);
		expect(model.view.groups[0].items[0].amount?.text).toBe('625 ml');
		model.step(-1);
		model.step(-1);
		expect(model.view.servings).toBe(3);
	});

	it('scales by an ingredient the author never keyed', () => {
		const model = make();
		model.scale = { kind: 'have', key: 'sugar', qty: 500, unit: 'g' };
		expect(model.view.factor).toBe(2);
		expect(model.view.groups[0].items[0].amount?.text).toBe('1 l');
	});

	it('swaps a variant into the ingredient and the step, and counts only non-default choices', () => {
		const model = make();
		expect(model.search('')).toBe('');
		model.setVariant('vanilla', 'pods');
		expect(model.view.groups[0].items[2].text).toBe('1 vanilla pod');
		expect(model.view.steps[0].text).toBe('Split the 1 vanilla pod.');
		expect(model.search('')).toBe('?v=vanilla:pods');
		model.setVariant('vanilla', 'extract');
		expect(model.search('')).toBe('');
	});

	it('restores its state from a query string', () => {
		const model = make();
		model.restore('?serves=8&u=us&v=vanilla:pods');
		expect(model.view.servings).toBe(8);
		expect(model.effectiveSystem).toBe('us');
		expect(model.view.groups[0].items[0].amount?.text).toContain('cup');
	});

	it('cycles an amount through its units and back, and forgets the cycle on a unit change', () => {
		const model = make();
		const item = () => model.view.groups[0].items[1];
		expect(model.amountText('0.1', item())).toBe('250 g');
		model.cycleUnit('0.1', item());
		expect(model.amountText('0.1', item())).toBe('0.25 kg');
		for (let n = 0; n < 3; n++) model.cycleUnit('0.1', item());
		expect(model.amountText('0.1', item())).toBe('250 g');
		model.cycleUnit('0.1', item());
		model.setSystem('us');
		expect(model.cycled).toEqual({});
	});

	it('does not offer to cycle a count', () => {
		const model = make();
		expect(model.canCycle(model.view.groups[0].items[2])).toBe(true);
		expect(
			model.canCycle({ ...model.view.groups[0].items[0], amount: { text: '2', min: 2, max: 2 } })
		).toBe(false);
	});
});
