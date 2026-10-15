import { SvelteSet } from 'svelte/reactivity';
import { readList, writeList } from './storage';

export const ticksKey = (recipeId: string) => `sapori:ticks:${recipeId}`;

/** A short fingerprint of some text (32-bit FNV-1a), stable across visits and builds. */
function fingerprint(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

/**
 * Ticks follow the ingredient or step, not its position, so a line added to the recipe in an update
 * does not move them onto its neighbour. An ingredient is known by its key or by its name in its
 * group, never by its amount, which changes with the servings.
 */
export const ingredientTick = (
	group: { name?: string | null },
	item: { key?: string | null; item: string }
): string => `i:${item.key || `${group.name ?? ''}/${item.item.trim().toLowerCase()}`}`;

/** A step is known by its key, or by its text as written (before any scaling). */
export const stepTick = (step: { key?: string | null; text: string }): string =>
	`s:${step.key || fingerprint(step.text.trim())}`;

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

	/** How many of `keys` are ticked; ticks left over from lines that are gone are not counted. */
	countOf(keys: string[]): number {
		return keys.filter((key) => this.#ticked.has(key)).length;
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
