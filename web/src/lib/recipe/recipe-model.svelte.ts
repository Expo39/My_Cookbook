import { convert, scaleRecipe, unitOptions } from '$lib/core';
import type {
	Recipe,
	RecipeData,
	ScaledIngredient,
	ScaledRecipe,
	Unit,
	UnitSystem
} from '$lib/types/recipe';
import { CONVERTIBLE, formatShown } from './format';
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
	/** The unit a reader has picked for an amount, keyed by group and item position. */
	picked = $state<Record<string, Unit>>({});
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
		this.picked = {};
	}

	setVariant(key: string, option: string): void {
		this.variants = { ...this.variants, [key]: option };
	}

	#amountUnit(item: ScaledIngredient): Unit | undefined {
		const unit = item.amount?.unit;
		return unit && CONVERTIBLE.has(unit) ? unit : undefined;
	}

	/** Whether the amount can be shown in another unit; counts and pinches cannot. */
	canPick(item: ScaledIngredient): boolean {
		return this.#amountUnit(item) !== undefined;
	}

	#shownIn(item: ScaledIngredient, to: Unit) {
		const from = this.#amountUnit(item);
		const amount = item.amount;
		if (!from || !amount) return undefined;
		const min = convert(amount.min, from, to, item.food ?? undefined);
		const max = convert(amount.max, from, to, item.food ?? undefined);
		return min === undefined || max === undefined ? undefined : formatShown(min, max, to);
	}

	/** The unit the amount is shown in: the reader's pick, or the scaled amount's own unit. */
	shownUnit(position: string, item: ScaledIngredient): Unit | undefined {
		return this.picked[position] ?? item.amount?.unit ?? undefined;
	}

	amountText(position: string, item: ScaledIngredient): string {
		const to = this.picked[position];
		return (to && this.#shownIn(item, to)) || (item.amount?.text ?? '');
	}

	/** The units of the current system this amount can be shown in, with the amount in each. */
	unitChoices(position: string, item: ScaledIngredient): { unit: Unit; text: string }[] {
		const from = this.#amountUnit(item);
		if (!from || !this.ready || !item.amount) return [];
		return unitOptions(item.amount.max, from, this.effectiveSystem).flatMap(({ unit }) => {
			const text = unit === from ? item.amount?.text : this.#shownIn(item, unit);
			return text ? [{ unit, text }] : [];
		});
	}

	/** The unit one more tap shows: the next one in the current system, wrapping round. */
	nextUnit(position: string, item: ScaledIngredient): Unit | undefined {
		const choices = this.unitChoices(position, item);
		if (choices.length < 2) return undefined;
		const at = choices.findIndex((choice) => choice.unit === this.shownUnit(position, item));
		return choices[(at + 1) % choices.length].unit;
	}

	cycleUnit(position: string, item: ScaledIngredient): void {
		const next = this.nextUnit(position, item);
		if (next) this.pickUnit(position, item, next);
	}

	pickUnit(position: string, item: ScaledIngredient, unit: Unit): void {
		const picked = { ...this.picked };
		if (unit === this.#amountUnit(item)) delete picked[position];
		else picked[position] = unit;
		this.picked = picked;
	}
}
