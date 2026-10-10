import { SvelteSet } from 'svelte/reactivity';
import { readList, writeList } from './storage';

export const ticksKey = (recipeId: string) => `sapori:ticks:${recipeId}`;

/** The ingredients and steps a cook has ticked off in one recipe, kept between visits. */
export class Ticks {
	readonly #ticked = new SvelteSet<string>();

	constructor(readonly recipeId: string) {}

	load(): void {
		this.#ticked.clear();
		for (const key of readList(ticksKey(this.recipeId))) this.#ticked.add(key);
	}

	has(key: string): boolean {
		return this.#ticked.has(key);
	}

	toggle(key: string): void {
		if (!this.#ticked.delete(key)) this.#ticked.add(key);
		this.#save();
	}

	/** Counts the ticks whose key starts with `prefix`, e.g. `i:` for ingredients. */
	count(prefix: string): number {
		return [...this.#ticked].filter((key) => key.startsWith(prefix)).length;
	}

	clear(prefix: string): void {
		for (const key of [...this.#ticked]) if (key.startsWith(prefix)) this.#ticked.delete(key);
		this.#save();
	}

	#save(): void {
		writeList(ticksKey(this.recipeId), this.#ticked);
	}
}
