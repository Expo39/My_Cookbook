import type { Recipe } from '$lib/types/recipe';
import type { LocalRecipe } from './local-store';

/** The file "Export" writes and "Import" reads back: the recipes, keyed by their address. */
interface ExportFile {
	kind: 'sapori-recipes';
	version: 1;
	recipes: { id: string; recipe: Recipe }[];
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const LIMIT = 500;

export function toExport(entries: LocalRecipe[]): string {
	const file: ExportFile = {
		kind: 'sapori-recipes',
		version: 1,
		recipes: entries.map(({ id, recipe }) => ({ id, recipe }))
	};
	return `${JSON.stringify(file, null, 2)}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function looksLikeRecipe(value: unknown): value is Recipe {
	return (
		isObject(value) &&
		typeof value.title === 'string' &&
		value.title.trim() !== '' &&
		typeof value.servings === 'number' &&
		Array.isArray(value.ingredientGroups) &&
		Array.isArray(value.steps)
	);
}

/** Reads an exported file. Throws an `Error` that says what is wrong, so nothing half-imports. */
export function parseExport(text: string): { id: string; recipe: Recipe }[] {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('That file is not a recipe export. Choose a file saved with Export.');
	}
	const list = isObject(data) && data.kind === 'sapori-recipes' ? data.recipes : undefined;
	if (!Array.isArray(list)) {
		throw new Error('That file is not a recipe export. Choose a file saved with Export.');
	}
	if (list.length > LIMIT) throw new Error(`An import can hold up to ${LIMIT} recipes.`);
	return list.map((entry, index) => {
		if (!isObject(entry) || typeof entry.id !== 'string' || !ID.test(entry.id)) {
			throw new Error(
				`Recipe ${index + 1} in the file has no valid address. Nothing was imported.`
			);
		}
		if (!looksLikeRecipe(entry.recipe)) {
			throw new Error(`"${entry.id}" in the file is not a complete recipe. Nothing was imported.`);
		}
		return { id: entry.id, recipe: entry.recipe };
	});
}
