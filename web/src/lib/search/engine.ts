import { createSearchEngine, loadCore, type SearchEngine } from '$lib/core';
import { createSource } from '$lib/data';

let engine: Promise<SearchEngine> | undefined;

/**
 * The one search engine for the page, built the first time anything asks for it. The header box and
 * the search page share it, so the index is fetched and parsed once.
 */
export function searchEngine(): Promise<SearchEngine> {
	engine ??= (async () => {
		const [json] = await Promise.all([createSource().getSearchIndex(), loadCore()]);
		return createSearchEngine(json);
	})().catch((error) => {
		engine = undefined;
		throw error;
	});
	return engine;
}
