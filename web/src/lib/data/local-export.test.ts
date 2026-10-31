import { describe, expect, it } from 'vitest';
import { parseExport, toExport } from './local-export';

const recipe = { title: 'Soup', summary: '', servings: 2, ingredientGroups: [], steps: [] };

describe('exporting and importing your recipes', () => {
	it('reads back what it wrote, leaving out whether a recipe was shared', () => {
		const text = toExport([
			{ id: 'soups/soup', recipe, updated: 1 },
			{ id: 'soups/stew', recipe, updated: 2, shared: { at: 3 } }
		]);
		expect(parseExport(text)).toEqual([
			{ id: 'soups/soup', recipe },
			{ id: 'soups/stew', recipe }
		]);
	});

	it('refuses a file that is not an export', () => {
		expect(() => parseExport('not json')).toThrow(/not a recipe export/);
		expect(() => parseExport('[]')).toThrow(/not a recipe export/);
		expect(() => parseExport('{"recipes": []}')).toThrow(/not a recipe export/);
	});

	it('refuses the whole file when one recipe is broken', () => {
		const file = (entry: unknown) =>
			JSON.stringify({ kind: 'sapori-recipes', version: 1, recipes: [entry] });
		expect(() => parseExport(file({ id: '../etc', recipe }))).toThrow(/valid address/);
		expect(() => parseExport(file({ id: 'soups/x', recipe: { title: 'X' } }))).toThrow(
			/not a complete recipe/
		);
	});
});
