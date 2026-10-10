import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderRecipe } from '$lib/data/canonical';
import type { Recipe } from '$lib/types/recipe';
import { emptyForm, formFromRecipe, parseQty, recipeFromForm, recipeId } from './recipe-form';

// Vitest runs from `web/`.
const root = join(process.cwd(), '..', 'recipes');

function files(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return files(path);
		return entry.name.endsWith('.json') && entry.name !== '_section.json' ? [path] : [];
	});
}

const recipes = files(root).map((path) => ({
	id: relative(root, path).replace(/\.json$/, ''),
	text: readFileSync(path, 'utf8')
}));

describe('the recipes folder', () => {
	it('has recipes to test against', () => {
		expect(recipes.length).toBeGreaterThan(0);
	});

	describe.each(recipes)('$id', ({ id, text }) => {
		const recipe = JSON.parse(text) as Recipe;

		it('survives the form and back with the same content', () => {
			const { recipe: rebuilt, issues } = recipeFromForm(formFromRecipe(recipe, id));
			expect(issues).toEqual([]);
			expect(JSON.parse(renderRecipe(rebuilt))).toEqual(recipe);
		});

		it('is written back byte for byte', () => {
			expect(renderRecipe(recipe)).toBe(text);
			const rebuilt = recipeFromForm(formFromRecipe(recipe, id)).recipe;
			expect(renderRecipe(rebuilt)).toBe(text);
		});

		it('keeps its address', () => {
			expect(recipeId(formFromRecipe(recipe, id))).toBe(id);
		});
	});
});

describe('parseQty', () => {
	it.each([
		['250', 250],
		['0.5', 0.5],
		['.5', 0.5],
		['1/2', 0.5],
		['1 1/2', 1.5],
		['½', 0.5],
		['1½', 1.5],
		['  3  ', 3]
	])('reads %j as %d', (text, value) => {
		expect(parseQty(text)).toBe(value);
	});

	it('leaves blank text undefined and anything else NaN', () => {
		expect(parseQty('')).toBeUndefined();
		expect(parseQty('   ')).toBeUndefined();
		for (const text of ['a lot', '1/0', '2,5', '-3']) expect(parseQty(text)).toBeNaN();
	});
});

describe('recipeFromForm', () => {
	const filled = () => {
		const form = emptyForm('desserts');
		form.title = ' Tart ';
		form.summary = 'Sweet.';
		form.groups[0].items[0] = {
			...form.groups[0].items[0],
			qtyMin: '1',
			qtyMax: '2',
			unit: 'cup',
			item: 'sugar'
		};
		form.steps[0].text = 'Bake.';
		return form;
	};

	it('trims text and turns a pair of amounts into a range', () => {
		const { recipe, issues } = recipeFromForm(filled());
		expect(issues).toEqual([]);
		expect(recipe.title).toBe('Tart');
		expect(recipe.ingredientGroups[0].items[0].amount).toEqual({
			qty: { min: 1, max: 2 },
			unit: 'cup'
		});
	});

	it('reports numbers it cannot read instead of dropping them', () => {
		const form = filled();
		form.groups[0].items[0].qtyMin = 'lots';
		form.prep = '1.5';
		const paths = recipeFromForm(form).issues.map((issue) => issue.path);
		expect(paths).toEqual(['times.prep', 'ingredientGroups[0].items[0].amount.qty']);
	});

	it('asks for the lower amount first', () => {
		const form = filled();
		form.groups[0].items[0].qtyMin = '';
		const { issues } = recipeFromForm(form);
		expect(issues[0].message).toBe('Fill in the lower amount first.');
	});

	it('uses the image the caller names', () => {
		const form = filled();
		form.imageAlt = ' A tart ';
		expect(recipeFromForm(form, { src: 'tart.jpg' }).recipe.image).toEqual({
			src: 'tart.jpg',
			alt: 'A tart'
		});
	});

	it('writes a servings noun as one word or as a pair', () => {
		const form = filled();
		form.nounOther = 'boards';
		expect(recipeFromForm(form).recipe.servingsNoun).toBe('boards');
		form.nounOne = 'person';
		form.nounOther = 'people';
		expect(recipeFromForm(form).recipe.servingsNoun).toEqual({ one: 'person', other: 'people' });
	});
});
