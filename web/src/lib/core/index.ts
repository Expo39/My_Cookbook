import type {
	CheckContext,
	CheckResult,
	Coverage,
	Ingredient,
	Recipe,
	RecipeFile,
	ScaleOptions,
	ScaleRequest,
	ScaledRecipe,
	ServingsNoun,
	SearchHit,
	Unit,
	UnitSystem
} from '$lib/types/recipe';

export type * from '$lib/types/recipe';

type RawEngine = {
	search(query: string): unknown;
	ingredientsIHave(have: string[]): unknown;
	free(): void;
};

type RawModule = {
	default(input?: { module_or_path: BufferSource | URL | string }): Promise<unknown>;
	scale_recipe(recipe: unknown, request?: unknown, options?: unknown): unknown;
	parse_ingredient_line(line: string): unknown;
	check_recipe(recipe: unknown, id: string, context?: unknown): unknown;
	check_removal(id: string, recipes: unknown): unknown;
	unit_options(qty: number, unit: Unit, system: UnitSystem): unknown;
	format_temperature(
		celsius: number,
		max: number | undefined,
		fan: number | undefined,
		internal: boolean,
		system: UnitSystem
	): string;
	servings_label(servings: number, noun?: ServingsNoun | null): string;
	convert(qty: number, from: Unit, to: Unit, food?: string): number | undefined;
	qr_matrix(text: string): unknown;
	version(): string;
	SearchEngine: new (indexJson: string) => RawEngine;
};

export interface SearchEngine {
	search(query: string): SearchHit[];
	ingredientsIHave(have: string[]): Coverage[];
	/** Releases the engine's memory; the engine cannot be used afterwards. */
	free(): void;
}

export class CoreNotLoadedError extends Error {
	constructor() {
		super('The WASM core is not loaded: await loadCore() on the client first.');
	}
}

let module: RawModule | undefined;
let loading: Promise<void> | undefined;

/**
 * Loads the WASM once. Browser only: on the server pages use the prescaled data, and tests pass the bytes.
 */
export function loadCore(bytes?: BufferSource): Promise<void> {
	loading ??= (async () => {
		if (!bytes && typeof window === 'undefined') {
			throw new Error('The WASM core can only be loaded in the browser.');
		}
		const glue = (await import('$lib/wasm/cookbook_wasm.js')) as unknown as RawModule;
		const source = bytes ?? (await import('$lib/wasm/cookbook_wasm_bg.wasm?url')).default;
		await glue.default({ module_or_path: source });
		module = glue;
	})().catch((error) => {
		loading = undefined;
		throw error;
	});
	return loading;
}

function core(): RawModule {
	if (!module) throw new CoreNotLoadedError();
	return module;
}

export const isCoreLoaded = (): boolean => module !== undefined;

export const version = (): string => core().version();

export function scaleRecipe(
	recipe: Recipe,
	request?: ScaleRequest,
	options?: ScaleOptions
): ScaledRecipe {
	return core().scale_recipe(recipe, request, options) as ScaledRecipe;
}

/** Throws an `Error` when the line has no ingredient name. */
export function parseIngredientLine(line: string): Ingredient {
	return core().parse_ingredient_line(line) as Ingredient;
}

export function checkRecipe(recipe: Recipe, id: string, context?: CheckContext): CheckResult[] {
	return core().check_recipe(recipe, id, context) as CheckResult[];
}

/** `recipes` is every recipe in the collection; the results list those that still link to `id`. */
export function checkRemoval(id: string, recipes: RecipeFile[]): CheckResult[] {
	return core().check_removal(id, recipes) as CheckResult[];
}

export function createSearchEngine(indexJson: string): SearchEngine {
	return new (core().SearchEngine)(indexJson) as unknown as SearchEngine;
}

/** The units a cook can pick for an amount in `system`, each with the same physical amount. */
export function unitOptions(
	qty: number,
	unit: Unit,
	system: UnitSystem
): { qty: number; unit: Unit }[] {
	return core().unit_options(qty, unit, system) as { qty: number; unit: Unit }[];
}

export interface TemperatureOptions {
	/** The top of a range, rendered "52-55 °C". */
	maxCelsius?: number;
	/** A meat or food temperature: exact degrees, never oven steps. */
	internal?: boolean;
}

export function formatTemperature(
	celsius: number,
	system: UnitSystem,
	fanCelsius?: number,
	options: TemperatureOptions = {}
): string {
	return core().format_temperature(
		celsius,
		options.maxCelsius,
		fanCelsius,
		options.internal ?? false,
		system
	);
}

/** "4 people", "1 person"; `noun` is the recipe's `servingsNoun`, and without one it reads "servings". */
export function servingsLabel(servings: number, noun?: ServingsNoun | null): string {
	return core().servings_label(servings, noun);
}

export function convert(qty: number, from: Unit, to: Unit, food?: string): number | undefined {
	return core().convert(qty, from, to, food);
}

/** The modules of a QR code for `text`, or `undefined` when the text is too long for any symbol. */
export function qrMatrix(text: string): { size: number; dark: boolean[] } | undefined {
	return core().qr_matrix(text) as { size: number; dark: boolean[] } | undefined;
}
