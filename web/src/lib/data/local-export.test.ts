import { describe, expect, it } from 'vitest';
import { csvRow, toExport } from './local-export';

const recipe = { title: 'Soup', summary: '', servings: 2, ingredientGroups: [], steps: [] };

describe('exporting your recipes', () => {
	it('keeps the recipes as stored, leaving out whether one was shared', () => {
		const file = JSON.parse(
			toExport([
				{ id: 'soups/soup', recipe, updated: 1 },
				{ id: 'soups/stew', recipe, updated: 2, shared: { at: 3 } }
			])
		);
		expect(file.recipes).toEqual([
			{ id: 'soups/soup', recipe },
			{ id: 'soups/stew', recipe }
		]);
	});

	it('quotes the spreadsheet cells that need it', () => {
		expect(csvRow(['Soup', 'a, b', 'say "hi"', 'two\nlines', 2, undefined])).toBe(
			'Soup,"a, b","say ""hi""","two\nlines",2,'
		);
	});
});
