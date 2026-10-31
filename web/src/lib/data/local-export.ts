import { loadCore, scaleRecipe } from '$lib/core';
import { recipeText } from '$lib/kitchen/share-text';
import { servingsText } from '$lib/recipe/format';
import type { LocalRecipe } from './local-store';

export type ExportFormat = 'json' | 'csv' | 'txt';

/** Tells Excel a CSV file is UTF-8, so accents and fractions survive. */
const BOM = '\uFEFF';

/** The complete recipes, exactly as stored, keyed by their address. */
export function toExport(entries: LocalRecipe[]): string {
	const file = {
		kind: 'sapori-recipes',
		version: 1,
		recipes: entries.map(({ id, recipe }) => ({ id, recipe }))
	};
	return `${JSON.stringify(file, null, 2)}\n`;
}

/** One CSV row; a cell with a comma, quote or line break is quoted, as spreadsheets expect. */
export const csvRow = (cells: (string | number | null | undefined)[]): string =>
	cells
		.map((cell) => {
			const text = String(cell ?? '');
			return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
		})
		.join(',');

const section = (id: string) => id.slice(0, Math.max(0, id.lastIndexOf('/')));

/**
 * The recipes as a file to keep: JSON as stored, a spreadsheet with a row per recipe, or plain text
 * to read and print. The readable two are worded as the recipe page words them.
 */
export async function exportFile(
	entries: LocalRecipe[],
	format: ExportFormat
): Promise<{ blob: Blob; name: string }> {
	const name = `my-recipes-${new Date().toISOString().slice(0, 10)}.${format}`;
	if (format === 'json') {
		return { blob: new Blob([toExport(entries)], { type: 'application/json' }), name };
	}
	await loadCore();
	const readable = entries.map(({ id, recipe }) => ({ id, recipe, view: scaleRecipe(recipe) }));
	if (format === 'txt') {
		const text = readable
			.map(({ recipe, view }) =>
				recipeText(recipe.title, servingsText(view.servings, recipe.servingsNoun), view)
			)
			.join('\n\n----------\n\n');
		return { blob: new Blob([`${text}\n`], { type: 'text/plain' }), name };
	}
	const rows = readable.map(({ id, recipe, view }) =>
		csvRow([
			recipe.title,
			section(id),
			view.servings,
			recipe.times?.prep,
			recipe.times?.cook,
			view.groups.flatMap((group) => group.items.map((item) => item.text)).join('\n'),
			view.steps
				.map((step, i) => `${i + 1}. ${step.segments.map((part) => part.text).join('')}`)
				.join('\n')
		])
	);
	const header = csvRow([
		'Title',
		'Section',
		'Servings',
		'Prep (min)',
		'Cook (min)',
		'Ingredients',
		'Method'
	]);
	return {
		blob: new Blob([`${BOM}${[header, ...rows].join('\n')}\n`], { type: 'text/csv' }),
		name
	};
}
