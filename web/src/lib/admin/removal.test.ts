import { describe, expect, it } from 'vitest';
import type { Recipe } from '$lib/types/recipe';
import { recipesLinkingTo, relink } from './removal';

const recipe = (related?: string[]): Recipe => ({
	title: 'Recipe',
	summary: '',
	servings: 2,
	ingredientGroups: [],
	steps: [],
	related
});

describe('recipes linking to another', () => {
	it('lists the others that name it and leaves out the recipe itself', () => {
		const found = recipesLinkingTo('a/one', [
			{ id: 'a/one', recipe: recipe(['a/one']) },
			{ id: 'a/two', recipe: recipe(['a/one', 'a/three']) },
			{ id: 'a/three', recipe: recipe() }
		]);
		expect(found.map((entry) => entry.id)).toEqual(['a/two']);
	});
});

describe('pointing links at a new address', () => {
	it('replaces the old address without listing the new one twice', () => {
		expect(relink(recipe(['x', 'a/one', 'b/one']), 'a/one', 'b/one').related).toEqual([
			'x',
			'b/one'
		]);
	});
});
