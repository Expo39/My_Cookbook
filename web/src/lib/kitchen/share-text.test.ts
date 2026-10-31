import { describe, expect, it } from 'vitest';
import type { ScaledRecipe } from '$lib/types/recipe';
import { recipeText } from './share-text';

const view = {
	groups: [
		{ name: null, items: [{ text: '400 g plain flour' }] },
		{ name: 'For the filling', items: [{ text: '500 g ricotta' }] }
	],
	steps: [
		{
			heading: 'Day 1',
			segments: [
				{ type: 'text', text: 'Mix ' },
				{ type: 'text', text: 'well.' }
			]
		},
		{ heading: null, segments: [{ type: 'text', text: 'Bake.' }] }
	]
} as unknown as ScaledRecipe;

describe('recipeText', () => {
	it('writes the recipe as plain text, parts and stages included, with the link last', () => {
		expect(recipeText('Pie', '4 servings', view, 'https://example.test/pie')).toBe(
			[
				'Pie',
				'4 servings',
				'',
				'Ingredients',
				'- 400 g plain flour',
				'',
				'For the filling',
				'- 500 g ricotta',
				'',
				'Method',
				'',
				'Day 1',
				'1. Mix well.',
				'2. Bake.',
				'',
				'https://example.test/pie'
			].join('\n')
		);
	});

	it('leaves the link out for a recipe kept on the device', () => {
		expect(recipeText('Pie', '4 servings', view)).not.toContain('https://');
	});
});
