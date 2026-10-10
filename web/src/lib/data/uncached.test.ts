import { afterEach, describe, expect, it, vi } from 'vitest';
import { uncached } from './uncached';

afterEach(() => vi.unstubAllGlobals());

describe('uncached', () => {
	it('asks the browser for the network, which the service worker leaves alone', async () => {
		const fetcher = vi.fn(async () => new Response('{}'));
		vi.stubGlobal('fetch', fetcher);
		await uncached('/data/recipes/a.json', { headers: { Accept: 'x' } });
		expect(fetcher).toHaveBeenCalledWith('/data/recipes/a.json', {
			headers: { Accept: 'x' },
			cache: 'no-store'
		});
	});
});
