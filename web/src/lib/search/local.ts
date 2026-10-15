import type { Recipe } from '$lib/types/recipe';

/**
 * Search over the recipes added on this device. They are not in the published index, so a plain
 * word match runs in the browser and its hits join the core's.
 */

interface Entry {
	id: string;
	recipe: Recipe;
}

/** Lower case with accents dropped, so "brulee" finds "Brûlée" as it does in the core's search. */
export const fold = (text: string): string =>
	text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const words = (text: string) =>
	fold(text)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

const items = (recipe: Recipe) =>
	recipe.ingredientGroups.flatMap((group) => group.items.filter((item) => item.item));

/** Recipes whose title, summary, tags or ingredients hold every word typed, title matches first. */
export function searchLocal(entries: Entry[], query: string): string[] {
	const wanted = words(query);
	if (!wanted.length) return [];
	return entries
		.map(({ id, recipe }) => {
			const title = fold(`${recipe.title} ${recipe.titleLocal ?? ''}`);
			const rest = fold(
				[
					recipe.summary,
					...(recipe.tags ?? []),
					...items(recipe).map((item) => item.item ?? '')
				].join(' ')
			);
			const inTitle = wanted.filter((word) => title.includes(word)).length;
			const found = wanted.every((word) => title.includes(word) || rest.includes(word));
			return { id, found, inTitle };
		})
		.filter((hit) => hit.found)
		.sort((a, b) => b.inTitle - a.inTitle)
		.map((hit) => hit.id);
}

/** How many of each recipe's ingredients are among those listed; optional ones do not count. */
export function haveLocal(
	entries: Entry[],
	have: string[]
): { id: string; matched: number; total: number }[] {
	const wanted = have.map(fold).filter(Boolean);
	if (!wanted.length) return [];
	return entries
		.map(({ id, recipe }) => {
			const needed = items(recipe).filter((item) => !item.optional);
			const matched = needed.filter((item) => {
				const name = fold(item.item ?? '');
				return wanted.some((term) => name.includes(term) || term.includes(name));
			}).length;
			return { id, matched, total: needed.length };
		})
		.filter((hit) => hit.matched > 0);
}

/** Titles that start with, or contain, what has been typed so far. */
export function suggestLocal(
	entries: Entry[],
	query: string,
	limit: number
): { id: string; title: string }[] {
	const typed = fold(query.trim());
	if (!typed) return [];
	return entries
		.map(({ id, recipe }) => ({ id, title: recipe.title, at: fold(recipe.title).indexOf(typed) }))
		.filter((hit) => hit.at >= 0)
		.sort((a, b) => a.at - b.at)
		.slice(0, limit)
		.map(({ id, title }) => ({ id, title }));
}
