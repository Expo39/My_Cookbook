import { lineKey, type ShoppingItem, type ShoppingRecipe } from '$lib/kitchen/shopping';
import { readJson, writeJson } from './storage';

export const SHOPPING_KEY = 'sapori:shopping';

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

/** The shopping list, kept as the recipes added to it plus the lines ticked off in the shop. */
class ShoppingList {
	recipes = $state<ShoppingRecipe[]>([]);
	ticked = $state<string[]>([]);

	load(): void {
		const stored = readJson(SHOPPING_KEY) as { recipes?: unknown; ticked?: unknown } | undefined;
		this.recipes = Array.isArray(stored?.recipes) ? stored.recipes.filter(isRecipe) : [];
		this.ticked = Array.isArray(stored?.ticked)
			? stored.ticked.filter((key): key is string => typeof key === 'string')
			: [];
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
		this.#save();
	}

	#save(): void {
		const live = new Set(this.recipes.flatMap((recipe) => recipe.items.map(lineKey)));
		this.ticked = this.ticked.filter((key) => live.has(key));
		writeJson(SHOPPING_KEY, { recipes: $state.snapshot(this.recipes), ticked: this.ticked });
	}
}

export const shopping = new ShoppingList();
