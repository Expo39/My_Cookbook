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
	],
	tips: []
} as unknown as ScaledRecipe;

describe('recipeText', () => {
	it('writes the recipe as plain text, parts and stages included, with the link last', () => {
		expect(
			recipeText({ title: 'Pie', serves: '4 servings', view, link: 'https://example.test/pie' })
		).toBe(
			[
				'Pie',
				'',
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
		expect(recipeText({ title: 'Pie', serves: '4 servings', view })).not.toContain('https://');
	});

	it('carries the local name, summary, times and tips, so the text is the whole recipe', () => {
		const text = recipeText({
			title: 'Pie',
			localTitle: 'Torta',
			summary: 'A rich ricotta pie.',
			serves: '4 servings',
			times: [
				['Prep', '20 min'],
				['Total', '1 hr']
			],
			view: { ...view, tips: ['Rest it before slicing.'] }
		});
		expect(text.split('\n').slice(0, 6)).toEqual([
			'Pie',
			'Torta',
			'',
			'A rich ricotta pie.',
			'',
			'4 servings | Prep 20 min | Total 1 hr'
		]);
		expect(text).toMatch(/\nChef's tip\nRest it before slicing\.$/);
	});
});
