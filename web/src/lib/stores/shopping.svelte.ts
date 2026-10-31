import { lineKey, type ShoppingItem, type ShoppingRecipe } from '$lib/kitchen/shopping';
import type { Unit } from '$lib/types/recipe';
import { readJson, writeJson } from './storage';

export const SHOPPING_KEY = 'sapori:shopping';

/** The list's own "recipe" for things the cook adds by hand, such as kitchen roll or extra lemons. */
export const OWN_ITEMS = 'own';

const isItem = (value: unknown): value is ShoppingItem =>
	typeof value === 'object' && value !== null && typeof (value as ShoppingItem).item === 'string';

function isRecipe(value: unknown): value is ShoppingRecipe {
	if (typeof value !== 'object' || value === null) return false;
	const recipe = value as ShoppingRecipe;
	return (
		typeof recipe.id === 'string' &&
		typeof recipe.title === 'string' &&
		typeof recipe.serves === 'string' &&
		Array.isArray(recipe.items) &&
		recipe.items.every(isItem)
	);
}

/** A quantity the cook typed in, in place of what the recipes add up to. */
export interface ChosenAmount {
	qty: number;
	unit: Unit | null;
}

const isAmount = (value: unknown): value is ChosenAmount =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as ChosenAmount).qty === 'number' &&
	Number.isFinite((value as ChosenAmount).qty);

/**
 * The shopping list, kept as the recipes added to it, the lines ticked off in the shop, and any
 * quantity the cook changed (to buy extra, say), keyed by line.
 */
class ShoppingList {
	recipes = $state<ShoppingRecipe[]>([]);
	ticked = $state<string[]>([]);
	amounts = $state<Record<string, ChosenAmount>>({});
	/** Lines the cook took off the list, such as something already in the cupboard. */
	hidden = $state<string[]>([]);

	load(): void {
		const stored = readJson(SHOPPING_KEY) as
			{ recipes?: unknown; ticked?: unknown; amounts?: unknown } | undefined;
		this.recipes = Array.isArray(stored?.recipes) ? stored.recipes.filter(isRecipe) : [];
		this.ticked = Array.isArray(stored?.ticked)
			? stored.ticked.filter((key): key is string => typeof key === 'string')
			: [];
		const amounts = stored?.amounts;
		this.amounts =
			typeof amounts === 'object' && amounts !== null
				? Object.fromEntries(Object.entries(amounts).filter(([, value]) => isAmount(value)))
				: {};
	}

	amountOf(key: string): ChosenAmount | undefined {
		return this.amounts[key];
	}

	setAmount(key: string, amount: ChosenAmount): void {
		this.amounts = { ...this.amounts, [key]: amount };
		this.#save();
	}

	resetAmount(key: string): void {
		this.amounts = Object.fromEntries(
			Object.entries(this.amounts).filter(([existing]) => existing !== key)
		);
		this.#save();
	}

	get count(): number {
		return this.recipes.reduce((sum, recipe) => sum + recipe.items.length, 0);
	}

	has(recipeId: string): boolean {
		return this.recipes.some((recipe) => recipe.id === recipeId);
	}

	/** Adding a recipe again replaces its earlier entry, so a change of scale is not counted twice. */
	add(recipe: ShoppingRecipe): void {
		this.recipes = [...this.recipes.filter((existing) => existing.id !== recipe.id), recipe];
		this.#save();
	}

	/** Adds a line typed in by hand, beside the recipes' lines. */
	addOwn(item: ShoppingItem): void {
		const own = this.recipes.find((recipe) => recipe.id === OWN_ITEMS);
		const items = [...(own?.items ?? []), item];
		this.recipes = [
			...this.recipes.filter((recipe) => recipe.id !== OWN_ITEMS),
			{ id: OWN_ITEMS, title: 'Added by you', serves: '', items }
		];
		this.#save();
	}

	/** A hand-typed item has no recipe amount to compare with, so its quantity is simply changed. */
	setOwnAmount(key: string, qty: number, unit: Unit | null): void {
		this.recipes = this.recipes.map((recipe) =>
			recipe.id === OWN_ITEMS
				? {
						...recipe,
						items: recipe.items.map((item) =>
							lineKey(item) === key ? { ...item, min: qty, max: qty, unit } : item
						)
					}
				: recipe
		);
		this.#save();
	}

	isHidden(key: string): boolean {
		return this.hidden.includes(key);
	}

	/** Takes a line off the list; a line typed in by hand is deleted outright. */
	hide(key: string): void {
		const own = this.recipes.find((recipe) => recipe.id === OWN_ITEMS);
		if (own?.items.some((item) => lineKey(item) === key)) {
			const items = own.items.filter((item) => lineKey(item) !== key);
			this.recipes = this.recipes
				.map((recipe) => (recipe.id === OWN_ITEMS ? { ...recipe, items } : recipe))
				.filter((recipe) => recipe.items.length > 0);
		}
		if (!this.hidden.includes(key)) this.hidden = [...this.hidden, key];
		this.#save();
	}

	/** Puts a line back: undoes `hide`, re-adding a hand-typed item from `item`. */
	unhide(key: string, item?: ShoppingItem): void {
		if (item && !this.recipes.some((recipe) => recipe.items.some((i) => lineKey(i) === key))) {
			this.addOwn(item);
		}
		this.hidden = this.hidden.filter((hidden) => hidden !== key);
		this.#save();
	}

	remove(recipeId: string): void {
		this.recipes = this.recipes.filter((recipe) => recipe.id !== recipeId);
		this.#save();
	}

	isTicked(key: string): boolean {
		return this.ticked.includes(key);
	}

	toggle(key: string): void {
		this.ticked = this.isTicked(key)
			? this.ticked.filter((ticked) => ticked !== key)
			: [...this.ticked, key];
		this.#save();
	}

	clearTicked(): void {
		const done = new Set(this.ticked);
		this.recipes = this.recipes
			.map((recipe) => ({
				...recipe,
				items: recipe.items.filter((item) => !done.has(lineKey(item)))
			}))
			.filter((recipe) => recipe.items.length > 0);
		this.ticked = [];
		this.#save();
	}

	clearAll(): void {
		this.recipes = [];
		this.ticked = [];
		this.amounts = {};
		this.hidden = [];
		this.#save();
	}

	#save(): void {
		const live = new Set(this.recipes.flatMap((recipe) => recipe.items.map(lineKey)));
		// A merged line can carry a "#n" suffix when units would not add up; it belongs to its base key.
		const alive = (key: string) => live.has(key.replace(/#\d+$/, ''));
		this.ticked = this.ticked.filter(alive);
		this.amounts = Object.fromEntries(Object.entries(this.amounts).filter(([key]) => alive(key)));
		this.hidden = this.hidden.filter(alive);
		writeJson(SHOPPING_KEY, {
			recipes: $state.snapshot(this.recipes),
			ticked: this.ticked,
			amounts: $state.snapshot(this.amounts),
			hidden: this.hidden
		});
	}
}

export const shopping = new ShoppingList();
