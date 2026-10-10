import { checkRemoval } from '$lib/core';
import type { RecipeSource } from '$lib/data';
import { allRecipes } from '$lib/data/tree';
import type { CheckResult, RecipeFile, SiteIndex } from '$lib/types/recipe';

/** The other recipes that still list `id` under `related`; deleting it would leave those links dangling. */
export async function recipesLinkingTo(
	id: string,
	index: SiteIndex,
	source: Pick<RecipeSource, 'getRecipe'>
): Promise<{ id: string; title: string; result: CheckResult }[]> {
	const cards = allRecipes(index).filter((card) => card.id !== id);
	const files: RecipeFile[] = await Promise.all(
		cards.map(async (card) => ({
			path: `${card.id}.json`,
			recipe: (await source.getRecipe(card.id)).recipe
		}))
	);
	return checkRemoval(id, files).map((result) => ({
		id: result.recipe,
		title: cards.find((card) => card.id === result.recipe)?.title ?? result.recipe,
		result
	}));
}
