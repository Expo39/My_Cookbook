import { personal } from '$lib/stores/personal.svelte';
import type { Recipe } from '$lib/types/recipe';
import { RecipeNotFoundError, type RecipeSource } from './source';
import type { StoredRecipe } from './stored';
import { allRecipes } from './tree';
import { WriteError, type RecipeWriter, type SaveResult } from './writer';

/**
 * Saves recipes in this browser, for anyone, with no token. It only ever touches recipes added on this
 * device: the cookbook's own recipes are read for the link and address checks but never written.
 */
export class LocalWriter implements RecipeWriter {
	readonly #site: Pick<RecipeSource, 'getIndex' | 'getRecipe'>;

	constructor(site: Pick<RecipeSource, 'getIndex' | 'getRecipe'>) {
		this.#site = site;
	}

	async read(id: string): Promise<Recipe> {
		await personal.load();
		const entry = personal.get(id);
		if (!entry || entry.shared) throw new RecipeNotFoundError(id);
		return entry.recipe;
	}

	async #taken(id: string): Promise<boolean> {
		const index = await this.#site.getIndex();
		return allRecipes(index).some((card) => card.id === id);
	}

	async save(id: string, recipe: Recipe, extras: { isNew: boolean }): Promise<SaveResult> {
		await personal.load();
		if (extras.isNew && ((await this.#taken(id)) || personal.get(id))) {
			throw new WriteError(
				'A recipe already uses that address. Change the title or the section.',
				'conflict'
			);
		}
		await personal.save(id, recipe);
		return { id };
	}

	async move(from: string, to: string, recipe: Recipe): Promise<SaveResult> {
		await personal.load();
		if ((await this.#taken(to)) || personal.get(to)) {
			throw new WriteError(
				'A recipe already uses that address. Change the title or the section.',
				'conflict'
			);
		}
		await personal.save(to, recipe, from);
		return { id: to };
	}

	async readAll(): Promise<StoredRecipe[]> {
		await personal.load();
		const index = await this.#site.getIndex();
		const published = await Promise.all(
			allRecipes(index).map(async (card) => ({
				id: card.id,
				recipe: (await this.#site.getRecipe(card.id)).recipe
			}))
		);
		return [...published, ...personal.list.map(({ id, recipe }) => ({ id, recipe }))];
	}

	async remove(id: string): Promise<SaveResult> {
		await personal.remove(id);
		return { id };
	}

	/** A recipe on this device can sit in a new section; the section exists once it is shared. */
	async createSection(): Promise<void> {}

	async uploadImage(): Promise<{ src: string }> {
		throw new WriteError(
			'Photos can be added once the recipe is shared with the cookbook.',
			'photo'
		);
	}

	async status() {
		return { state: 'live' as const };
	}
}
