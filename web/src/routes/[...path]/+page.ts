import { error } from '@sveltejs/kit';
import { createSource, RecipeNotFoundError } from '$lib/data';
import { findRecipe, findSection } from '$lib/data/tree';
import { takeFresh } from '$lib/kitchen/live.svelte';

export const load = async ({ params, parent, fetch }) => {
	const { index } = await parent();
	const section = findSection(index, params.path);
	if (section) return { kind: 'section' as const, section };

	const card = findRecipe(index, params.path);
	if (!card) error(404, 'That page is not in the cookbook.');
	try {
		// After "Show the new version" the recipe is read past the browser's and the worker's caches.
		const fetcher: typeof fetch = takeFresh(card.id)
			? (input, init) => fetch(input, { ...init, cache: 'no-store' })
			: fetch;
		return {
			kind: 'recipe' as const,
			card,
			recipe: await createSource(fetcher).getRecipe(card.id)
		};
	} catch (cause) {
		if (cause instanceof RecipeNotFoundError) error(404, 'That recipe is not in the cookbook.');
		throw cause;
	}
};
