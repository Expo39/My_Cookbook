import { describe, expect, it } from 'vitest';
import type { Recipe } from '$lib/types/recipe';
import { formFromImport } from './import';
import { recipeFromForm } from './recipe-form';

const recipe: Recipe = {
	title: 'Lemon Tart',
	summary: 'A sharp tart.',
	servings: 8,
	ingredientGroups: [{ items: [{ amount: { qty: 200, unit: 'g' }, item: 'sugar' }] }],
	steps: [{ text: 'Bake.' }]
};

describe('formFromImport', () => {
	it('keeps the chosen folder and lets the address follow the title', () => {
		const form = formFromImport(recipe, 'desserts/tarts');
		expect(form.section).toBe('desserts/tarts');
		expect(form.slug).toBe('');
		expect(form.slugTouched).toBe(false);
		expect(form.title).toBe('Lemon Tart');
	});

	it('works with no folder chosen yet', () => {
		expect(formFromImport(recipe, '').section).toBe('');
	});

	it('builds the same recipe back', () => {
		const { recipe: built, issues } = recipeFromForm(formFromImport(recipe, 'desserts'));
		expect(issues).toEqual([]);
		expect(built.ingredientGroups[0].items[0]).toEqual(recipe.ingredientGroups[0].items[0]);
	});
});
