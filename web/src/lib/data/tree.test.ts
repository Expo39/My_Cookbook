import { describe, expect, it } from 'vitest';
import type { RecipeCard, SectionNode, SiteIndex } from '$lib/types/recipe';
import { countRecipes, findRecipe, findSection, latestRecipes, sectionTrail } from './tree';

const card = (id: string): RecipeCard => ({
	id,
	slug: id.split('/').pop() as string,
	title: id,
	summary: '',
	tags: [],
	times: {},
	servings: 2,
	section: []
});

const node = (path: string, recipes: string[], sections: SectionNode[] = []): SectionNode => ({
	path,
	title: path,
	recipes: recipes.map(card),
	sections
});

const index: SiteIndex = {
	sections: [
		node('mains', [], [node('mains/beef', ['mains/beef/steak', 'mains/beef/stew'])]),
		node('soups', ['soups/tomato'])
	]
};

describe('the section tree', () => {
	it('counts recipes in nested sections', () => {
		expect(countRecipes(index.sections[0])).toBe(2);
	});

	it('finds sections and recipes by path', () => {
		expect(findSection(index, 'mains/beef')?.recipes).toHaveLength(2);
		expect(findSection(index, 'mains/pork')).toBeUndefined();
		expect(findRecipe(index, 'soups/tomato')?.slug).toBe('tomato');
	});

	it('gives the trail of sections above a recipe', () => {
		expect(sectionTrail(index, 'mains/beef/steak').map((n) => n.path)).toEqual([
			'mains',
			'mains/beef'
		]);
	});

	it('takes the latest recipes from the end of the index, newest first', () => {
		expect(latestRecipes(index, 2).map((c) => c.id)).toEqual(['soups/tomato', 'mains/beef/stew']);
	});
});
