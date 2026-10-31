import { describe, expect, it } from 'vitest';
import type { Recipe } from '$lib/types/recipe';
import { haveLocal, searchLocal, suggestLocal } from './local';

const recipe = (title: string, items: string[], extra: Partial<Recipe> = {}): Recipe => ({
	title,
	summary: '',
	servings: 2,
	steps: [],
	ingredientGroups: [{ items: items.map((item) => ({ item })) }],
	...extra
});

const entries = [
	{ id: 'desserts/creme', recipe: recipe("Nanna's Crème Brûlée", ['cream', 'egg yolks', 'sugar']) },
	{ id: 'soups/minestra', recipe: recipe('Minestra', ['pumpkin', 'potato', 'onion']) },
	{
		id: 'soups/brodu',
		recipe: recipe('Brodu', ['beef', 'onion', 'parsley'], { tags: ['Winter'] })
	}
];

describe('search over your own recipes', () => {
	it('matches every word, ignoring accents, and ranks title matches first', () => {
		expect(searchLocal(entries, 'brulee')).toEqual(['desserts/creme']);
		expect(searchLocal(entries, 'onion')).toEqual(['soups/minestra', 'soups/brodu']);
		expect(searchLocal(entries, 'brodu onion')).toEqual(['soups/brodu']);
		expect(searchLocal(entries, 'winter')).toEqual(['soups/brodu']);
		expect(searchLocal(entries, 'onion cream')).toEqual([]);
		expect(searchLocal(entries, '  ')).toEqual([]);
	});

	it('counts the ingredients you have', () => {
		expect(haveLocal(entries, ['Onions', 'pumpkin'])).toEqual([
			{ id: 'soups/minestra', matched: 2, total: 3 },
			{ id: 'soups/brodu', matched: 1, total: 3 }
		]);
	});

	it('suggests titles that hold what is typed, earliest match first', () => {
		expect(suggestLocal(entries, 'br', 6)).toEqual([
			{ id: 'soups/brodu', title: 'Brodu' },
			{ id: 'desserts/creme', title: "Nanna's Crème Brûlée" }
		]);
	});
});
