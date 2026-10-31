import type {
	Amount,
	CheckResult,
	Difficulty,
	Ingredient,
	Recipe,
	ScaleMode,
	ServingsNoun,
	Unit,
	Variant
} from '$lib/types/recipe';

let counter = 0;
export const uid = (): string => `r${++counter}`;

export interface IngredientRow {
	uid: string;
	qtyMin: string;
	qtyMax: string;
	unit: Unit | '';
	prefix: string;
	item: string;
	note: string;
	optional: boolean;
	scale: ScaleMode;
	key: string;
	/** Fields the form does not edit but must not lose. */
	extra: { food?: string; each?: number; alt?: Amount };
}

export interface GroupForm {
	uid: string;
	name: string;
	totalQty: string;
	totalMax: string;
	totalUnit: Unit | '';
	items: IngredientRow[];
}

export interface StepRow {
	uid: string;
	heading: string;
	text: string;
	key: string;
	active: string;
	passive: string;
}

export interface TipRow {
	uid: string;
	text: string;
}

export interface FormData {
	title: string;
	titleLocal: string;
	summary: string;
	servings: string;
	nounOne: string;
	nounOther: string;
	prep: string;
	cook: string;
	rest: string;
	difficulty: Difficulty | '';
	tags: string[];
	/** The folder under `recipes/`. */
	section: string;
	slug: string;
	slugTouched: boolean;
	/** Folders to create with their titles, outermost first. */
	newSections: { path: string; title: string }[];
	groups: GroupForm[];
	steps: StepRow[];
	tips: TipRow[];
	related: string[];
	variants: Variant[];
	imageSrc: string;
	imageAlt: string;
	passthrough: Pick<Recipe, 'equipment' | 'pan' | 'scaling' | 'precise' | 'order' | 'origin'>;
}

export const SCALE_MODES: { value: ScaleMode; label: string; help: string }[] = [
	{
		value: 'linear',
		label: 'goes up and down with them',
		help: 'Twice the servings, twice the amount. Right for most ingredients.'
	},
	{
		value: 'discrete',
		label: 'rounds to whole pieces',
		help: 'Rounds to whole items, such as eggs, cloves or tins.'
	},
	{
		value: 'seasoning',
		label: 'grows more gently, like salt',
		help: 'Grows more slowly than the rest, so salt and spice are not overdone. The page says to start low.'
	},
	{
		value: 'fixed',
		label: 'stays the same',
		help: 'The amount never changes, such as a pan greased once or a garnish.'
	},
	{
		value: 'toTaste',
		label: 'is added to taste',
		help: 'No amount is shown; the line reads "to taste".'
	}
];

export const UNITS: { value: Unit | ''; label: string }[] = [
	{ value: '', label: 'none (a count)' },
	{ value: 'g', label: 'g' },
	{ value: 'kg', label: 'kg' },
	{ value: 'ml', label: 'ml' },
	{ value: 'l', label: 'l' },
	{ value: 'tsp', label: 'tsp' },
	{ value: 'tbsp', label: 'tbsp' },
	{ value: 'cup', label: 'cup' },
	{ value: 'oz', label: 'oz' },
	{ value: 'lb', label: 'lb' },
	{ value: 'floz', label: 'fl oz' },
	{ value: 'pinch', label: 'pinch' }
];

const VULGAR: Record<string, number> = {
	'¼': 0.25,
	'½': 0.5,
	'¾': 0.75,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'⅛': 0.125
};

/** "250", "0.5", "1/2", "1 1/2" or "½"; `undefined` for blank and `NaN` for anything else. */
export function parseQty(text: string): number | undefined {
	let value = text.trim();
	if (!value) return undefined;
	let total = 0;
	const glyph = [...value].find((c) => c in VULGAR);
	if (glyph) {
		total = VULGAR[glyph];
		value = value.replace(glyph, ' ').trim();
		if (!value) return total;
	}
	const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(value);
	if (mixed) return total + Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
	const fraction = /^(\d+)\/(\d+)$/.exec(value);
	if (fraction) {
		const denominator = Number(fraction[2]);
		return denominator === 0 ? NaN : total + Number(fraction[1]) / denominator;
	}
	if (!/^\d*\.?\d+$/.test(value)) return NaN;
	return total + Number(value);
}

const show = (qty: number | undefined | null): string =>
	qty === undefined || qty === null ? '' : String(Math.round(qty * 1000) / 1000);

const num = (text: string): number | undefined => {
	const value = text.trim() === '' ? undefined : Number(text);
	return value;
};

function totalFields(total: Amount | null | undefined): { totalQty: string; totalMax: string } {
	const qty = total?.qty;
	if (typeof qty === 'object' && qty !== null)
		return { totalQty: show(qty.min), totalMax: show(qty.max) };
	return { totalQty: show(qty), totalMax: '' };
}

export function rowFromIngredient(ingredient: Ingredient): IngredientRow {
	const qty = ingredient.amount?.qty;
	const range = typeof qty === 'object' && qty !== null;
	const extra: IngredientRow['extra'] = {};
	if (ingredient.food) extra.food = ingredient.food;
	if (ingredient.each != null) extra.each = ingredient.each;
	if (ingredient.alt) extra.alt = ingredient.alt;
	return {
		uid: uid(),
		qtyMin: range ? show(qty.min) : show(qty as number | undefined),
		qtyMax: range ? show(qty.max) : '',
		unit: ingredient.amount?.unit ?? '',
		prefix: ingredient.prefix ?? '',
		item: ingredient.item ?? '',
		note: ingredient.note ?? '',
		optional: ingredient.optional ?? false,
		scale: ingredient.scale ?? 'linear',
		key: ingredient.key ?? '',
		extra
	};
}

export const emptyRow = (): IngredientRow => rowFromIngredient({});

export const emptyGroup = (): GroupForm => ({
	uid: uid(),
	name: '',
	totalQty: '',
	totalMax: '',
	totalUnit: '',
	items: [emptyRow()]
});

export const emptyStep = (): StepRow => ({
	uid: uid(),
	heading: '',
	text: '',
	key: '',
	active: '',
	passive: ''
});

export function emptyForm(section = ''): FormData {
	return {
		title: '',
		titleLocal: '',
		summary: '',
		servings: '4',
		nounOne: '',
		nounOther: '',
		prep: '',
		cook: '',
		rest: '',
		difficulty: '',
		tags: [],
		section,
		slug: '',
		slugTouched: false,
		newSections: [],
		groups: [{ ...emptyGroup(), items: [] }],
		steps: [emptyStep()],
		tips: [],
		related: [],
		variants: [],
		imageSrc: '',
		imageAlt: '',
		passthrough: {}
	};
}

export function formFromRecipe(recipe: Recipe, id: string): FormData {
	const noun = recipe.servingsNoun;
	const { equipment, pan, scaling, precise, order, origin } = recipe;
	const slashed = id.lastIndexOf('/');
	return {
		title: recipe.title,
		titleLocal: recipe.titleLocal ?? '',
		summary: recipe.summary,
		servings: String(recipe.servings),
		nounOne: typeof noun === 'object' && noun ? noun.one : '',
		nounOther: typeof noun === 'object' && noun ? noun.other : (noun ?? ''),
		prep: show(recipe.times?.prep),
		cook: show(recipe.times?.cook),
		rest: show(recipe.times?.rest),
		difficulty: recipe.difficulty ?? '',
		tags: [...(recipe.tags ?? [])],
		section: id.slice(0, Math.max(0, slashed)),
		slug: id.slice(slashed + 1),
		slugTouched: true,
		newSections: [],
		groups: recipe.ingredientGroups.map((group) => ({
			uid: uid(),
			name: group.name ?? '',
			...totalFields(group.total),
			totalUnit: group.total?.unit ?? '',
			items: group.items.map(rowFromIngredient)
		})),
		steps: recipe.steps.map((step) => ({
			uid: uid(),
			heading: step.heading ?? '',
			text: step.text,
			key: step.key ?? '',
			active: show(step.time?.active),
			passive: show(step.time?.passive)
		})),
		tips: (recipe.tips ?? []).map((text) => ({ uid: uid(), text })),
		related: [...(recipe.related ?? [])],
		variants: structuredClone(recipe.variants ?? []),
		imageSrc: recipe.image?.src ?? '',
		imageAlt: recipe.image?.alt ?? '',
		passthrough: { equipment, pan, scaling, precise, order, origin }
	};
}

export const recipeId = (form: FormData): string =>
	form.section ? `${form.section}/${form.slug}` : form.slug;

type Issue = Pick<CheckResult, 'path' | 'message'>;

/** An amount from the two boxes and the unit; a problem is reported once and the amount is left out. */
function amountFrom(
	lower: string,
	upper: string,
	unit: Unit | '',
	path: string,
	issues: Issue[]
): Amount | undefined {
	const min = parseQty(lower);
	const max = parseQty(upper);
	if ([min, max].some((q) => q !== undefined && Number.isNaN(q))) {
		issues.push({ path, message: 'Enter a number such as 250, 0.5, 1/2 or 1 1/2.' });
		return undefined;
	}
	if (min === undefined) {
		if (max !== undefined) issues.push({ path, message: 'Fill in the lower amount first.' });
		return undefined;
	}
	return {
		qty: max !== undefined && max !== min ? { min, max } : min,
		...(unit ? { unit } : {})
	};
}

function ingredientFromRow(row: IngredientRow, path: string, issues: Issue[]): Ingredient {
	const amount = amountFrom(row.qtyMin, row.qtyMax, row.unit, `${path}.amount.qty`, issues);
	return {
		...(row.key.trim() ? { key: row.key.trim() } : {}),
		...row.extra,
		...(amount ? { amount } : {}),
		...(row.prefix.trim() ? { prefix: row.prefix.trim() } : {}),
		...(row.item.trim() ? { item: row.item.trim() } : {}),
		...(row.note.trim() ? { note: row.note.trim() } : {}),
		...(row.optional ? { optional: true } : {}),
		...(row.scale !== 'linear' ? { scale: row.scale } : {})
	};
}

function minutes(text: string, path: string, issues: Issue[]): number | undefined {
	const value = num(text);
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value < 0) {
		issues.push({ path, message: 'Enter whole minutes, such as 20.' });
		return undefined;
	}
	return value;
}

/** The recipe the form describes, plus the problems the checklist cannot see because they never became data. */
export function recipeFromForm(
	form: FormData,
	image?: { src: string }
): { recipe: Recipe; issues: Issue[] } {
	const issues: Issue[] = [];
	const times = {
		prep: minutes(form.prep, 'times.prep', issues),
		cook: minutes(form.cook, 'times.cook', issues),
		rest: minutes(form.rest, 'times.rest', issues)
	};
	const servings = num(form.servings);
	const noun: ServingsNoun | undefined =
		form.nounOne.trim() && form.nounOther.trim()
			? { one: form.nounOne.trim(), other: form.nounOther.trim() }
			: form.nounOther.trim() || undefined;
	const src = image?.src ?? form.imageSrc;

	const recipe: Recipe = {
		title: form.title.trim(),
		summary: form.summary.trim(),
		servings: servings !== undefined && Number.isInteger(servings) ? servings : 0,
		...(noun ? { servingsNoun: noun } : {}),
		...(form.titleLocal.trim() ? { titleLocal: form.titleLocal.trim() } : {}),
		...form.passthrough,
		...(Object.values(times).some((v) => v !== undefined)
			? { times: Object.fromEntries(Object.entries(times).filter(([, v]) => v !== undefined)) }
			: {}),
		...(form.difficulty ? { difficulty: form.difficulty } : {}),
		tags: form.tags,
		...(src ? { image: { src, alt: form.imageAlt.trim() } } : {}),
		ingredientGroups: form.groups.map((group, g) => {
			const total = amountFrom(
				group.totalQty,
				group.totalMax,
				group.totalUnit,
				`ingredientGroups[${g}].total.qty`,
				issues
			);
			return {
				...(group.name.trim() ? { name: group.name.trim() } : {}),
				...(total ? { total } : {}),
				items: group.items.map((row, i) =>
					ingredientFromRow(row, `ingredientGroups[${g}].items[${i}]`, issues)
				)
			};
		}),
		steps: form.steps.map((step, i) => {
			const active = minutes(step.active, `steps[${i}].time.active`, issues);
			const passive = minutes(step.passive, `steps[${i}].time.passive`, issues);
			return {
				...(step.heading.trim() ? { heading: step.heading.trim() } : {}),
				text: step.text.trim(),
				...(step.key.trim() ? { key: step.key.trim() } : {}),
				...(active !== undefined || passive !== undefined
					? {
							time: {
								...(active !== undefined ? { active } : {}),
								...(passive !== undefined ? { passive } : {})
							}
						}
					: {})
			};
		}),
		tips: form.tips.map((tip) => tip.text.trim()).filter(Boolean),
		variants: structuredClone(form.variants),
		related: form.related
	};
	return { recipe, issues };
}
