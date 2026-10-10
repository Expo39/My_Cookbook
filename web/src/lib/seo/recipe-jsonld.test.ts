import { describe, expect, it } from 'vitest';
import { instagram } from '$lib/config';
import type { Recipe, ScaledRecipe } from '$lib/types/recipe';
import { buildRecipeJsonLd, toScriptJson } from './recipe-jsonld';

const recipe: Recipe = {
	title: 'Beef Wellington',
	summary: 'A showpiece.',
	servings: 5,
	times: { cook: 95, rest: 20 },
	tags: ['Dinner party', 'Classics'],
	ingredientGroups: [{ items: [] }],
	steps: [],
	variants: [
		{
			key: 'wrap',
			label: 'Wrap',
			options: [
				{ key: 'pastry', label: 'Pastry', default: true },
				{ key: 'crepes', label: 'Crepes' }
			]
		}
	]
};

const step = (text: string, heading?: string) => ({ text, heading, segments: [] });

const view = {
	factor: 1,
	servings: 5,
	hints: [],
	tips: [],
	warnings: [],
	groups: [
		{
			name: 'Beef',
			items: [{ text: '1 kg beef fillet' }, { text: 'Olive oil' }]
		},
		{ items: [{ text: '500 g mushrooms, chopped' }] }
	],
	steps: [
		step('Season the beef.'),
		step('Sear it.', 'Day 1: the night before'),
		step('Chill it.'),
		step('Wrap it.', 'Day 2: assembly')
	]
} as unknown as ScaledRecipe;

const input = {
	recipe,
	view,
	section: ['Main Courses', 'Beef & Steak'],
	url: 'https://example.test/main-courses/beef-steak/beef-wellington'
};

describe('the recipe JSON-LD', () => {
	const ld = buildRecipeJsonLd(input);

	it('describes the recipe for search engines', () => {
		expect(ld).toMatchObject({
			'@context': 'https://schema.org',
			'@type': 'Recipe',
			name: 'Beef Wellington',
			url: input.url,
			author: {
				'@type': 'Person',
				name: 'Antonio',
				...(instagram ? { sameAs: [instagram.url] } : {})
			},
			recipeCategory: 'Main Courses',
			keywords: 'Dinner party, Classics',
			recipeYield: ['5', '5 servings']
		});
	});

	it('uses ISO 8601 durations, with the total including the rest', () => {
		expect(ld.cookTime).toBe('PT1H35M');
		expect(ld.totalTime).toBe('PT1H55M');
		expect(ld.prepTime).toBeUndefined();
	});

	it('lists the ingredients as rendered text at the written servings', () => {
		expect(ld.recipeIngredient).toEqual([
			'1 kg beef fillet',
			'Olive oil',
			'500 g mushrooms, chopped'
		]);
	});

	it('groups steps into sections by heading, and keeps leading steps together', () => {
		expect(ld.recipeInstructions).toEqual([
			{
				'@type': 'HowToSection',
				name: 'Method',
				itemListElement: [{ '@type': 'HowToStep', text: 'Season the beef.' }]
			},
			{
				'@type': 'HowToSection',
				name: 'Day 1: the night before',
				itemListElement: [
					{ '@type': 'HowToStep', text: 'Sear it.' },
					{ '@type': 'HowToStep', text: 'Chill it.' }
				]
			},
			{
				'@type': 'HowToSection',
				name: 'Day 2: assembly',
				itemListElement: [{ '@type': 'HowToStep', text: 'Wrap it.' }]
			}
		]);
	});

	it('uses plain steps when there are no headings, and never turns variants into sections', () => {
		const plain = buildRecipeJsonLd({
			...input,
			view: { ...view, steps: [step('One.'), step('Two.')] }
		});
		expect(plain.recipeInstructions.map((s) => s['@type'])).toEqual(['HowToStep', 'HowToStep']);
		expect(JSON.stringify(plain)).not.toContain('Crepes');
	});

	it('omits the image until a card exists, and escapes angle brackets for the script element', () => {
		expect(ld.image).toBeUndefined();
		expect(toScriptJson({ text: '</script>' })).not.toContain('<');
	});
});
