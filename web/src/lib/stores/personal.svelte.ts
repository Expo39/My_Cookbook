import { keepStorage, localRecipes, type LocalRecipe } from '$lib/data/local-store';
import type { Recipe } from '$lib/types/recipe';

/**
 * The recipes added on this device, kept in IndexedDB so they survive closing the browser. Every page
 * reads them from here; a change in another tab arrives through a BroadcastChannel.
 */
class Personal {
	/** Raw, not deeply reactive: entries are replaced whole, and recipes must stay cloneable. */
	list = $state.raw<LocalRecipe[]>([]);
	loaded = $state(false);
	#channel: BroadcastChannel | undefined;
	#loading: Promise<void> | undefined;

	load(): Promise<void> {
		if (typeof indexedDB === 'undefined') return Promise.resolve();
		if (!this.#channel && typeof BroadcastChannel !== 'undefined') {
			this.#channel = new BroadcastChannel('sapori:personal');
			this.#channel.onmessage = () => void this.#read();
		}
		this.#loading ??= this.#read();
		return this.#loading;
	}

	async #read(): Promise<void> {
		try {
			const all = await localRecipes.all();
			this.list = all.sort((a, b) => b.updated - a.updated);
		} catch {
			this.list = [];
		}
		this.loaded = true;
	}

	get(id: string): LocalRecipe | undefined {
		return this.list.find((entry) => entry.id === id);
	}

	/** Theirs to change: added here and not yet handed over to the cookbook. */
	editable(id: string): boolean {
		const entry = this.get(id);
		return !!entry && !entry.shared;
	}

	async save(id: string, recipe: Recipe, previous?: string): Promise<void> {
		keepStorage();
		if (previous && previous !== id) await localRecipes.remove(previous);
		await localRecipes.put({ id, recipe: $state.snapshot(recipe) as Recipe, updated: Date.now() });
		await this.#changed();
	}

	async markShared(id: string, commit?: string): Promise<void> {
		const entry = await localRecipes.get(id);
		if (!entry) return;
		await localRecipes.put({ ...entry, shared: { at: Date.now(), commit } });
		await this.#changed();
	}

	async remove(id: string): Promise<void> {
		await localRecipes.remove(id);
		await this.#changed();
	}

	async clear(): Promise<void> {
		await localRecipes.clear();
		await this.#changed();
	}

	/** Shared recipes that the deployed cookbook now carries are dropped: the site has its own copy. */
	async forgetPublished(published: Set<string>): Promise<void> {
		const done = this.list.filter((entry) => entry.shared && published.has(entry.id));
		for (const entry of done) await localRecipes.remove(entry.id);
		if (done.length) await this.#changed();
	}

	async #changed(): Promise<void> {
		await this.#read();
		this.#channel?.postMessage('changed');
	}
}

export const personal = new Personal();
