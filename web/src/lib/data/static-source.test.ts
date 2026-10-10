import { describe, expect, it, vi } from 'vitest';
import { createSource, RecipeNotFoundError } from '.';

const reply = (body: string, status = 200) => new Response(body, { status });

describe('the static source', () => {
	it('reads the index, a recipe and the search index from the data folder', async () => {
		const fetcher = vi.fn(async (url: RequestInfo | URL) => {
			if (String(url).endsWith('index.json')) return reply('{"sections":[]}');
			if (String(url).endsWith('search.json')) return reply('{"docs":[]}');
			return reply('{"recipe":{"title":"Soup"}}');
		});
		const source = createSource(fetcher as typeof fetch);
		expect(await source.getIndex()).toEqual({ sections: [] });
		expect(await source.getSearchIndex()).toBe('{"docs":[]}');
		expect((await source.getRecipe('soups/tomato')).recipe.title).toBe('Soup');
		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'/data/index.json',
			'/data/search.json',
			'/data/recipes/soups/tomato.json'
		]);
	});

	it('reports a missing recipe as not found', async () => {
		const source = createSource((async () => reply('', 404)) as typeof fetch);
		await expect(source.getRecipe('nope')).rejects.toBeInstanceOf(RecipeNotFoundError);
	});

	it('reads the self-hosted API for the server backends, and refuses unknown backends', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => reply('{"sections":[]}'));
		expect(await createSource(fetcher, 'api').getIndex()).toEqual({ sections: [] });
		expect(fetcher.mock.calls[0][0]).toBe('/api/index');
		expect(() => createSource(undefined, 'ftp')).toThrow('Unknown PUBLIC_BACKEND');
	});
});
