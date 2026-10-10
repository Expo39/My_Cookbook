import { SvelteSet } from 'svelte/reactivity';
import { readList, writeList } from './storage';

export const FAVOURITES_KEY = 'sapori:favourites';

class Favourites {
	readonly #ids = new SvelteSet<string>();

	load(): void {
		for (const id of readList(FAVOURITES_KEY)) this.#ids.add(id);
	}

	has(id: string): boolean {
		return this.#ids.has(id);
	}

	toggle(id: string): void {
		if (!this.#ids.delete(id)) this.#ids.add(id);
		writeList(FAVOURITES_KEY, this.#ids);
	}
}

export const favourites = new Favourites();
