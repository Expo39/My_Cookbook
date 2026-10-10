import { convert, scaleRecipe, toggleUnit } from '$lib/core';
import type {
	Recipe,
	RecipeData,
	ScaledIngredient,
	ScaledRecipe,
	Unit,
	UnitSystem
} from '$lib/types/recipe';
import { TOGGLEABLE, formatShown } from './format';
import { withKeys } from './keys';
import { parseState, toRequest, writeState, type ScaleChoice, type ViewState } from './url-state';

const EPSILON = 1e-6;

/** Everything a reader can change on a recipe page, and the view that results from it. */
export class RecipeModel {
	readonly data: RecipeData;
	readonly keyed: Recipe;
	readonly effectiveSystem: UnitSystem;
	scale = $state<ScaleChoice>({ kind: 'written' });
	system = $state<UnitSystem | null>(null);
	variants = $state<Record<string, string>>({});
	/** The unit a reader has cycled an amount to, keyed by group and item position. */
	cycled = $state<Record<string, Unit>>({});
	ready = $state(false);

	constructor(data: RecipeData, defaultSystem: () => UnitSystem) {
		this.data = data;
		this.keyed = withKeys(data.recipe);
		this.effectiveSystem = $derived(this.system ?? defaultSystem());
	}

	chosenVariants = $derived(this.#validVariants());

	state = $derived<ViewState>({
		scale: this.scale,
		system: this.system,
		variants: this.chosenVariants
	});

	view = $derived.by<ScaledRecipe>(() => {
		const untouched =
			this.scale.kind === 'written' &&
			this.effectiveSystem === 'metric' &&
			Object.keys(this.chosenVariants).length === 0;
		if (!this.ready || untouched) return this.data.view;
		try {
			return scaleRecipe($state.snapshot(this.keyed) as Recipe, toRequest(this.scale), {
				system: this.effectiveSystem,
				variants: $state.snapshot(this.chosenVariants)
			});
		} catch {
			return this.data.view;
		}
	});

	scaled = $derived(Math.abs(this.view.factor - 1) > EPSILON);

	#validVariants(): Record<string, string> {
		const valid: Record<string, string> = {};
		for (const variant of this.data.recipe.variants ?? []) {
			const chosen = this.variants[variant.key];
			const defaultKey = variant.options.find((o) => o.default)?.key ?? variant.options[0]?.key;
			if (chosen && chosen !== defaultKey && variant.options.some((o) => o.key === chosen)) {
				valid[variant.key] = chosen;
			}
		}
		return valid;
	}

	chosenOption(variantKey: string): string {
		const variant = this.data.recipe.variants?.find((v) => v.key === variantKey);
		return (
			this.variants[variantKey] ??
			variant?.options.find((o) => o.default)?.key ??
			variant?.options[0]?.key ??
			''
		);
	}

	restore(search: string): void {
		const parsed = parseState(search);
		this.scale = parsed.scale;
		this.system = parsed.system;
		this.variants = parsed.variants;
	}

	/** The query string for the current state, leaving other parameters as they were. */
	search(current: string): string {
		return writeState(current, this.state);
	}

	setServings(servings: number): void {
		this.scale = { kind: 'servings', servings: Math.min(999, Math.max(1, servings)) };
	}

	/** Moves to the next whole number of servings in `direction`. */
	step(direction: 1 | -1): void {
		const current = this.view.servings;
		const next =
			direction > 0 ? Math.floor(current + EPSILON) + 1 : Math.ceil(current - EPSILON) - 1;
		this.setServings(next);
	}

	setMultiplier(multiplier: number): void {
		this.scale = multiplier === 1 ? { kind: 'written' } : { kind: 'multiplier', multiplier };
	}

	resetScale(): void {
		this.scale = { kind: 'written' };
	}

	setSystem(system: UnitSystem): void {
		this.system = system;
		this.cycled = {};
	}

	setVariant(key: string, option: string): void {
		this.variants = { ...this.variants, [key]: option };
	}

	#amountUnit(item: ScaledIngredient): Unit | undefined {
		const unit = item.amount?.unit;
		return unit && TOGGLEABLE.has(unit) ? unit : undefined;
	}

	canCycle(item: ScaledIngredient): boolean {
		return this.#amountUnit(item) !== undefined;
	}

	/** The amount in the unit the reader cycled it to, or `undefined` while it is shown as scaled. */
	#cycledAmount(position: string, item: ScaledIngredient) {
		const from = this.#amountUnit(item);
		const to = this.cycled[position];
		const amount = item.amount;
		if (!from || !to || !amount) return undefined;
		const min = convert(amount.min, from, to, item.food ?? undefined);
		const max = convert(amount.max, from, to, item.food ?? undefined);
		return min === undefined || max === undefined ? undefined : { min, max, unit: to };
	}

	amountText(position: string, item: ScaledIngredient): string {
		const shown = this.#cycledAmount(position, item);
		return shown ? formatShown(shown.min, shown.max, shown.unit) : (item.amount?.text ?? '');
	}

	/** The unit one more click would show, for the button's label. */
	nextUnit(position: string, item: ScaledIngredient): Unit | undefined {
		const from = this.#amountUnit(item);
		if (!from || !this.ready) return undefined;
		const shown = this.#cycledAmount(position, item);
		const current = shown ?? { max: item.amount?.max ?? 0, unit: from };
		return toggleUnit(current.max, current.unit)?.unit;
	}

	cycleUnit(position: string, item: ScaledIngredient): void {
		const next = this.nextUnit(position, item);
		if (!next) return;
		const cycled = { ...this.cycled };
		if (next === this.#amountUnit(item)) delete cycled[position];
		else cycled[position] = next;
		this.cycled = cycled;
	}
}
