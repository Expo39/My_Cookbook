import type { RecipeData, SiteIndex } from '$lib/types/recipe';
import type { RecipeSource } from './source';

/** The self-hosted server backend; it is wired up in a later checkpoint. */
export class ApiSource implements RecipeSource {
	getIndex(): Promise<SiteIndex> {
		return Promise.reject(notConfigured());
	}

	getRecipe(): Promise<RecipeData> {
		return Promise.reject(notConfigured());
	}

	getSearchIndex(): Promise<string> {
		return Promise.reject(notConfigured());
	}
}

const notConfigured = () => new Error('The API backend is not configured.');
