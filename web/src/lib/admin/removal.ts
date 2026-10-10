import type { StoredRecipe } from '$lib/data/stored';
import type { Recipe } from '$lib/types/recipe';

/** The other recipes that list `id` under `related`; removing or moving it would leave those links dangling. */
export const recipesLinkingTo = (id: string, recipes: StoredRecipe[]): StoredRecipe[] =>
	recipes.filter((entry) => entry.id !== id && entry.recipe.related?.includes(id));

/** The recipe with its link to `from` pointed at `to`, without listing `to` twice. */
export function relink(recipe: Recipe, from: string, to: string): Recipe {
	const related = [...new Set((recipe.related ?? []).map((id) => (id === from ? to : id)))];
	return { ...recipe, related };
}
