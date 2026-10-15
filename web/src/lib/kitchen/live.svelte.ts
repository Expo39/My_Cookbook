import { base } from '$app/paths';
import type { Recipe } from '$lib/types/recipe';
import { DATA_CACHE } from './cache-names';

/** A tab that keeps coming back into view checks at most this often. */
const QUIET_MILLISECONDS = 15_000;

/** Only the static site has a `manifest.json` to compare with. */
export const watchesUpdates = __BACKEND__ === 'static';

/** Recipes whose next load must skip every cache, once, after an update was applied. */
const fresh: Record<string, boolean> = {};

export function takeFresh(id: string): boolean {
	const wanted = fresh[id] === true;
	delete fresh[id];
	return wanted;
}

/**
 * Notices that the open recipe was changed and redeployed, so a cook who left the tab open sees the
 * new version without losing their place. The cheap `manifest.json` says whether anything was
 * rebuilt; only then is the recipe itself fetched and compared.
 */
export class LiveRecipe {
	updated = $state(false);
	#builtAt: string | undefined;
	#latest: string | undefined;
	#checked = 0;
	readonly #fetch: typeof fetch;

	constructor(
		readonly id: string,
		readonly current: () => Recipe,
		fetcher: typeof fetch = (input, init) => fetch(input, init)
	) {
		this.#fetch = fetcher;
	}

	get url(): string {
		return `${base}/data/recipes/${this.id}.json`;
	}

	/** Looks for a newer version; true once one has been found. Failures are quiet: it is a nicety. */
	async check(now = Date.now()): Promise<boolean> {
		if (this.updated || now - this.#checked < QUIET_MILLISECONDS) return this.updated;
		this.#checked = now;
		try {
			const manifest = await this.#fetch(`${base}/data/manifest.json`, { cache: 'no-store' });
			if (!manifest.ok) return false;
			const { builtAt } = (await manifest.json()) as { builtAt?: string };
			// The first check always compares, since the page itself may have come from a cache.
			if (this.#builtAt !== undefined && builtAt === this.#builtAt) return false;
			this.#builtAt = builtAt;
			const response = await this.#fetch(this.url, { cache: 'no-store' });
			if (!response.ok) return false;
			const text = await response.text();
			const { recipe } = JSON.parse(text) as { recipe: Recipe };
			if (JSON.stringify(recipe) === JSON.stringify(this.current())) return false;
			this.#latest = text;
			this.updated = true;
		} catch {
			/* offline, or the site is mid-deploy; the next check tries again */
		}
		return this.updated;
	}

	/**
	 * Makes the next load read the new version: the service worker's copy is replaced and the load
	 * skips the caches once. The caller then invalidates `url`.
	 */
	async prepare(): Promise<void> {
		fresh[this.id] = true;
		if (!this.#latest || typeof caches === 'undefined') return;
		try {
			const cache = await caches.open(DATA_CACHE);
			await cache.put(
				this.url,
				new Response(this.#latest, { headers: { 'content-type': 'application/json' } })
			);
		} catch {
			/* without the cache the uncached load still shows the new version */
		}
	}
}
