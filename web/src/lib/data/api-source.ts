import type { RecipeData, SiteIndex } from '$lib/types/recipe';
import { RecipeNotFoundError, type RecipeSource } from './source';

/** Reads the self-hosted server's API, which serves the same shapes as the static build. */
export class ApiSource implements RecipeSource {
	readonly #fetch: typeof fetch;

	constructor(fetcher: typeof fetch = fetch) {
		this.#fetch = fetcher;
	}

	async #get(path: string): Promise<Response> {
		const response = await this.#fetch(`/api${path}`, { credentials: 'include' });
		if (!response.ok) throw new Error(`Could not read ${path} (${response.status}).`);
		return response;
	}

	async getIndex(): Promise<SiteIndex> {
		return (await this.#get('/index')).json();
	}

	async getRecipe(id: string): Promise<RecipeData> {
		const response = await this.#fetch(`/api/recipes/${id}`, { credentials: 'include' });
		if (response.status === 404) throw new RecipeNotFoundError(id);
		if (!response.ok) throw new Error(`Could not read recipe ${id} (${response.status}).`);
		return response.json();
	}

	async getSearchIndex(): Promise<string> {
		return (await this.#get('/search-index')).text();
	}
}
