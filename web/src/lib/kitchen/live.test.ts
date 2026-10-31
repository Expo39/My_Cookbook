import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '$lib/types/recipe';
import { LiveRecipe, takeFresh } from './live.svelte';

const recipe = (title: string) =>
	({ title, summary: '', servings: 2, ingredientGroups: [], steps: [] }) as Recipe;

/** A site whose build stamp and recipe can be changed, counting the requests it answers. */
function site(builtAt: string, title: string) {
	const state = { builtAt, title };
	const fetcher = vi.fn<typeof fetch>(async (input) => {
		const url = String(input);
		const body = url.endsWith('manifest.json')
			? { builtAt: state.builtAt }
			: { recipe: recipe(state.title) };
		return new Response(JSON.stringify(body));
	});
	return { state, fetcher };
}

describe('noticing an updated recipe', () => {
	it('compares the recipe on the first check, then only after a new build', async () => {
		const { state, fetcher } = site('a', 'Soup');
		const live = new LiveRecipe('soups/soup', () => recipe('Soup'), fetcher);
		expect(await live.check(100_000)).toBe(false);
		expect(fetcher).toHaveBeenCalledTimes(2);

		expect(await live.check(200_000)).toBe(false);
		expect(fetcher).toHaveBeenCalledTimes(3);

		state.builtAt = 'b';
		expect(await live.check(300_000)).toBe(false);
		expect(fetcher).toHaveBeenCalledTimes(5);

		state.builtAt = 'c';
		state.title = 'Better soup';
		expect(await live.check(400_000)).toBe(true);
		expect(live.updated).toBe(true);
	});

	it('does not ask again while the tab keeps coming back within a few seconds', async () => {
		const { fetcher } = site('a', 'Soup');
		const live = new LiveRecipe('soups/soup', () => recipe('Soup'), fetcher);
		await live.check(100_000);
		await live.check(105_000);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('stays quiet when the site cannot be reached', async () => {
		const live = new LiveRecipe(
			'soups/soup',
			() => recipe('Soup'),
			async () => {
				throw new TypeError('offline');
			}
		);
		expect(await live.check(100_000)).toBe(false);
	});

	it('asks the next load to skip the caches once', async () => {
		const { fetcher } = site('a', 'New');
		const live = new LiveRecipe('soups/soup', () => recipe('Old'), fetcher);
		await live.check(100_000);
		await live.prepare();
		expect(takeFresh('soups/soup')).toBe(true);
		expect(takeFresh('soups/soup')).toBe(false);
	});
});
