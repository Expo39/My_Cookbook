import type { RecipeData, SiteIndex } from '$lib/types/recipe';

/** Where the site reads its recipes from. Pages never fetch recipe data any other way. */
export interface RecipeSource {
	getIndex(): Promise<SiteIndex>;
	/** Throws `RecipeNotFoundError` for an unknown id. */
	getRecipe(id: string): Promise<RecipeData>;
	/** The search index as the JSON text the WASM `SearchEngine` takes. */
	getSearchIndex(): Promise<string>;
}

export class RecipeNotFoundError extends Error {
	constructor(readonly id: string) {
		super(`There is no recipe called "${id}".`);
	}
}
