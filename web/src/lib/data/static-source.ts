import { base } from '$app/paths';
import type { RecipeData, SiteIndex } from '$lib/types/recipe';
import { RecipeNotFoundError, type RecipeSource } from './source';

/**
 * Reads the JSON that `cookbook-cli build` writes to `static/data`. Pass SvelteKit's `fetch` inside a
 * `load` function: while prerendering it reads the file from disc and the client reuses the response.
 */
export class StaticSource implements RecipeSource {
	readonly #fetch: typeof fetch;

	constructor(fetcher: typeof fetch = fetch) {
		this.#fetch = fetcher;
	}

	async #get(path: string): Promise<Response> {
		const response = await this.#fetch(`${base}/data/${path}`);
		if (!response.ok) throw new Error(`Could not read ${path} (${response.status}).`);
		return response;
	}

	async getIndex(): Promise<SiteIndex> {
		return (await this.#get('index.json')).json();
	}

	async getRecipe(id: string): Promise<RecipeData> {
		const response = await this.#fetch(`${base}/data/recipes/${id}.json`);
		if (response.status === 404) throw new RecipeNotFoundError(id);
		if (!response.ok) throw new Error(`Could not read recipe ${id} (${response.status}).`);
		return response.json();
	}

	async getSearchIndex(): Promise<string> {
		return (await this.#get('search.json')).text();
	}
}
