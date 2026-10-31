import type { Recipe, RecipeCard, RecipeData, ScaledRecipe, SiteIndex } from '$lib/types/recipe';
import type { LocalRecipe } from './local-store';
import { sectionTrail } from './tree';

/** The card the site shows for a recipe added on this device. Local photos are not kept. */
export function localCard(index: SiteIndex, id: string, recipe: Recipe): RecipeCard {
	const times = recipe.times ?? {};
	return {
		id,
		slug: id.split('/').at(-1) ?? id,
		title: recipe.title,
		titleLocal: recipe.titleLocal,
		summary: recipe.summary,
		servings: recipe.servings,
		tags: recipe.tags ?? [],
		difficulty: recipe.difficulty,
		section: sectionTrail(index, id).map((node) => node.title),
		times: {
			...times,
			total: Object.values(times).reduce<number>((sum, minutes) => sum + (minutes ?? 0), 0)
		}
	};
}

export const localCards = (index: SiteIndex, entries: LocalRecipe[]): RecipeCard[] =>
	entries.map((entry) => localCard(index, entry.id, entry.recipe));

/** What a recipe page needs, built in the browser; `view` comes from the WASM scaler. */
export function localData(
	index: SiteIndex,
	id: string,
	recipe: Recipe,
	view: ScaledRecipe
): RecipeData {
	return {
		recipe,
		view,
		related: [],
		section: sectionTrail(index, id).map((node) => node.title)
	};
}
