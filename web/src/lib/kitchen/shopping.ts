import { formatNumber, formatShown } from '$lib/recipe/format';
import type { ScaledGroup, Unit, UnitSystem } from '$lib/types/recipe';

export interface ShoppingItem {
	food?: string | null;
	prefix?: string | null;
	item: string;
	note?: string | null;
	min?: number;
	max?: number;
	unit?: Unit | null;
}

export interface ShoppingRecipe {
	id: string;
	title: string;
	/** How much of the recipe was added, e.g. "8 servings". */
	serves: string;
	items: ShoppingItem[];
}

export interface ShoppingLine {
	key: string;
	food?: string | null;
	prefix?: string | null;
	item: string;
	note?: string | null;
	min?: number;
	max?: number;
	unit?: Unit | null;
	recipes: { id: string; title: string }[];
}

export type Convert = (qty: number, from: Unit, to: Unit, food?: string) => number | undefined;

const noConversion: Convert = () => undefined;

/** Teaspoons in each spoon-sized unit (a US cup is 240 ml and a teaspoon 5 ml). */
const SPOON: Partial<Record<Unit, number>> = { tsp: 1, tbsp: 3, cup: 48 };

function spoonsTo(qty: number, from: Unit, to: Unit): number | undefined {
	const [a, b] = [SPOON[from], SPOON[to]];
	return a && b ? (qty * a) / b : undefined;
}

const METRIC_OF: Partial<Record<Unit, Unit>> = { oz: 'g', lb: 'g', floz: 'ml', cup: 'ml' };

/**
 * Puts a merged line in the reader's unit system. Spoons stay spoons, stepping up to cups only in
 * the US system and from a quarter cup; metric never shows cups, ounces or pounds.
 */
function inSystem(line: ShoppingLine, system: UnitSystem, convert: Convert): void {
	const unit = line.unit;
	if (!unit || line.min === undefined || line.max === undefined) return;
	if (SPOON[unit]) {
		const [min, max] = [line.min * (SPOON[unit] ?? 1), line.max * (SPOON[unit] ?? 1)];
		const to: Unit = system === 'us' && min >= 12 ? 'cup' : max >= 3 ? 'tbsp' : 'tsp';
		if (to !== unit) {
			line.min = spoonsTo(line.min, unit, to) as number;
			line.max = spoonsTo(line.max, unit, to) as number;
			line.unit = to;
		}
		return;
	}
	const target = system === 'metric' ? METRIC_OF[unit] : undefined;
	if (!target) return;
	const [min, max] = [
		convert(line.min, unit, target, line.food ?? undefined),
		convert(line.max, unit, target, line.food ?? undefined)
	];
	if (min === undefined || max === undefined) return;
	Object.assign(line, { min, max, unit: target });
}

/** Lower case, no accents or punctuation, and a crude singular so "eggs" meets "egg". */
export function normalise(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => {
			if (word.length < 4 || word.endsWith('ss')) return word;
			if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
			if (word.endsWith('oes')) return word.slice(0, -2);
			return word.endsWith('s') ? word.slice(0, -1) : word;
		})
		.join(' ');
}

/**
 * Lines merge by food id when there is one. Otherwise they merge by the wording and the unit,
 * because a free-text match across units would be a guess. A prefix ("zest of") keeps its own line.
 */
export function lineKey(item: ShoppingItem): string {
	const prefix = item.prefix ? `|${normalise(item.prefix)}` : '';
	if (item.food) return `food:${item.food}${prefix}`;
	return `text:${normalise(item.item)}${prefix}|${item.unit ?? ''}`;
}

/** The ingredients of a scaled recipe, as they are shown now: scale, units and variant included. */
export function itemsFromGroups(groups: ScaledGroup[]): ShoppingItem[] {
	return groups.flatMap((group) =>
		group.items.map((item) => ({
			food: item.food,
			prefix: item.prefix,
			item: item.item,
			note: item.note,
			...(item.amount
				? { min: item.amount.min, max: item.amount.max, unit: item.amount.unit ?? null }
				: {})
		}))
	);
}

const hasQuantity = (line: { min?: number }) => line.min !== undefined;

/** Merges every recipe's items into one list. Quantities add only when the units are compatible. */
export function mergeLines(
	recipes: ShoppingRecipe[],
	convert: Convert = noConversion,
	system: UnitSystem = 'metric'
): ShoppingLine[] {
	const byKey = new Map<string, ShoppingLine[]>();
	const order: ShoppingLine[] = [];

	for (const recipe of recipes) {
		for (const item of recipe.items) {
			const key = lineKey(item);
			const lines = byKey.get(key) ?? [];
			byKey.set(key, lines);

			const add = (line: ShoppingLine) => {
				if (!line.recipes.some((from) => from.id === recipe.id)) {
					line.recipes.push({ id: recipe.id, title: recipe.title });
				}
			};

			if (!hasQuantity(item)) {
				if (lines.length === 0) {
					const line = { key, ...pick(item), recipes: [] };
					lines.push(line);
					order.push(line);
				}
				add(lines[0]);
				continue;
			}

			const amount = { min: item.min as number, max: item.max as number };
			let merged = false;
			for (const line of lines) {
				if (!hasQuantity(line)) {
					Object.assign(line, { ...amount, unit: item.unit ?? null });
					merged = true;
				} else if ((line.unit ?? null) === (item.unit ?? null)) {
					line.min = (line.min as number) + amount.min;
					line.max = (line.max as number) + amount.max;
					merged = true;
				} else if (line.unit && item.unit) {
					const spoons = SPOON[line.unit] && SPOON[item.unit];
					const [min, max] = spoons
						? [
								spoonsTo(amount.min, item.unit, line.unit),
								spoonsTo(amount.max, item.unit, line.unit)
							]
						: [
								convert(amount.min, item.unit, line.unit, item.food ?? undefined),
								convert(amount.max, item.unit, line.unit, item.food ?? undefined)
							];
					if (min !== undefined && max !== undefined) {
						line.min = (line.min as number) + min;
						line.max = (line.max as number) + max;
						merged = true;
					}
				}
				if (merged) {
					add(line);
					break;
				}
			}
			if (!merged) {
				// The first line keeps the plain key, so ticks stored before lines were split still apply to it.
				const line: ShoppingLine = {
					key: lines.length ? `${key}#${lines.length}` : key,
					...pick(item),
					...amount,
					recipes: []
				};
				add(line);
				lines.push(line);
				order.push(line);
			}
		}
	}
	for (const line of order) inSystem(line, system, convert);
	return order;
}

function pick(item: ShoppingItem) {
	return {
		food: item.food,
		prefix: item.prefix,
		item: item.item,
		note: item.note,
		unit: item.unit ?? null
	};
}

/** "2 cups", "300–400 g" or "3" for a count; empty for a line with no quantity. */
export function quantityText(line: Pick<ShoppingLine, 'min' | 'max' | 'unit'>): string {
	if (line.min === undefined || line.max === undefined) return '';
	if (line.unit) return formatShown(line.min, line.max, line.unit);
	const [low, high] = [formatNumber(line.min), formatNumber(line.max)];
	return low === high ? high : `${low}–${high}`;
}

export function lineText(line: ShoppingLine): string {
	const quantity = quantityText(line);
	return [line.prefix, quantity, line.item].filter(Boolean).join(' ');
}

export interface Aisle {
	id: string;
	label: string;
	pattern: RegExp;
}

// A rough guess from the wording, since recipes carry no aisle. The first match wins, so
// "chicken stock" is a cupboard item and not meat.
export const AISLES: Aisle[] = [
	{
		id: 'cupboard',
		label: 'Store cupboard',
		pattern:
			/\b(?:stock|broth|flour|sugar|salt|black pepper|peppercorn|oil|vinegar|rice|pasta|spaghetti|tagliatelle|gnocchi|lentil|bean|chickpea|tins?|tomato pur|passata|sauce|honey|syrup|vanilla|cocoa|chocolate|pistachio|almond|walnut|hazelnut|panko|breadcrumb|yeast|baking|cornflour|couscous|oat|wine|mustard|paste|pickle|caper|olive)/
	},
	{
		id: 'herbs',
		label: 'Herbs and spices',
		pattern:
			/\b(?:basil|parsley|thyme|rosemary|sage|oregano|mint|coriander|dill|chive|bay|cumin|paprika|cinnamon|nutmeg|clove|turmeric|chilli|spice|saffron|curry)/
	},
	{
		id: 'dairy',
		label: 'Dairy and eggs',
		pattern: /\b(?:milk|cream|butter|cheese|mozzarella|parmesan|yogh?urt|egg|mascarpone|ricotta)/
	},
	{
		id: 'meat',
		label: 'Meat and fish',
		pattern:
			/\b(?:beef|steak|fillet|lamb|pork|porchetta|pancetta|bacon|ham|sausage|cotechino|chicken|duck|turkey|mince|rib|tuna|salmon|fish|prawn|shrimp|anchov|cod|sea bass)/
	},
	{
		id: 'produce',
		label: 'Fruit and vegetables',
		pattern:
			/\b(?:onion|shallot|garlic|carrot|celery|potato|tomato|mushroom|pepper|asparagus|spinach|lettuce|rocket|leek|courgette|aubergine|cabbage|lemon|lime|orange|apple|pear|fruit|berry|cucumber|ginger|spring onion|veg|pea|corn|avocado)/
	}
];

export const OTHER_AISLE: Pick<Aisle, 'id' | 'label'> = { id: 'other', label: 'Other' };

export function aisleOf(line: Pick<ShoppingLine, 'food' | 'item'>): Pick<Aisle, 'id' | 'label'> {
	const text = normalise(`${line.food ?? ''} ${line.item}`.replace(/-/g, ' '));
	return AISLES.find(({ pattern }) => pattern.test(text)) ?? OTHER_AISLE;
}

export interface LineGroup {
	id: string;
	label: string;
	lines: ShoppingLine[];
}

export function groupByAisle(lines: ShoppingLine[]): LineGroup[] {
	const groups = new Map<string, LineGroup>();
	for (const line of lines) {
		const aisle = aisleOf(line);
		const group = groups.get(aisle.id) ?? { id: aisle.id, label: aisle.label, lines: [] };
		group.lines.push(line);
		groups.set(aisle.id, group);
	}
	const known = [...AISLES, OTHER_AISLE].map((aisle) => aisle.id);
	return [...groups.values()].sort((a, b) => known.indexOf(a.id) - known.indexOf(b.id));
}

/** One group per recipe, each with that recipe's own items (not merged), in the order they were added. */
export function groupByRecipe(
	recipes: ShoppingRecipe[],
	convert?: Convert,
	system?: UnitSystem
): LineGroup[] {
	return recipes.map((recipe) => ({
		id: recipe.id,
		label: `${recipe.title} (${recipe.serves})`,
		lines: mergeLines([recipe], convert, system)
	}));
}

export function listText(groups: LineGroup[], ticked: ReadonlySet<string>): string {
	const sections = groups
		.map((group) => {
			const open = group.lines.filter((line) => !ticked.has(line.key));
			return open.length
				? [group.label, ...open.map((line) => `- ${lineText(line)}`)].join('\n')
				: '';
		})
		.filter(Boolean);
	return ['Shopping list', ...sections].join('\n\n');
}
