import type { ServingsNoun, Unit } from '$lib/types/recipe';

const GLYPHS: [number, string][] = [
	[0.125, '⅛'],
	[0.25, '¼'],
	[1 / 3, '⅓'],
	[0.5, '½'],
	[2 / 3, '⅔'],
	[0.75, '¾']
];

const trimDecimal = (value: number): string => String(Number(value.toFixed(2)));

/** Mirrors the core's number formatting: decimals for metric, vulgar fractions for everything else. */
export function formatNumber(value: number, decimal = false): string {
	if (decimal) return trimDecimal(value);
	const whole = Math.floor(value);
	const fraction = value - whole;
	if (fraction > 0.98) return trimDecimal(whole + 1);
	if (fraction < 0.02) return trimDecimal(whole);
	const glyph = GLYPHS.find(([size]) => Math.abs(size - fraction) < 0.02)?.[1];
	if (!glyph) return trimDecimal(value);
	return whole < 1 ? glyph : `${whole}${glyph}`;
}

/** Mirrors the core's `servings_label`, so the server-rendered page needs no WASM. */
export function servingsText(servings: number, noun?: ServingsNoun | null): string {
	const single = Math.abs(servings - 1) < 1e-9;
	let word = single ? 'serving' : 'servings';
	if (typeof noun === 'string') word = noun;
	else if (noun) word = single ? noun.one : noun.other;
	return `${formatNumber(servings)} ${word}`;
}

export function formatMinutes(minutes: number): string {
	const total = Math.round(minutes);
	if (total < 60) return `${total} min`;
	const [hours, rest] = [Math.floor(total / 60), total % 60];
	return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function isoDuration(minutes: number): string {
	const total = Math.round(minutes);
	const [hours, rest] = [Math.floor(total / 60), total % 60];
	return `PT${hours ? `${hours}H` : ''}${rest || !hours ? `${rest}M` : ''}`;
}

export const unitLabel = (unit: Unit): string => (unit === 'floz' ? 'fl oz' : unit);

/** Units whose amounts can be cycled with a click. Pinches and counts have nowhere to go. */
export const TOGGLEABLE: ReadonlySet<Unit> = new Set([
	'g',
	'kg',
	'ml',
	'l',
	'tsp',
	'tbsp',
	'cup',
	'oz',
	'lb',
	'floz'
]);

const nearest = (value: number, step: number) => Math.max(step, Math.round(value / step) * step);

function roundFor(value: number, unit: Unit): number {
	switch (unit) {
		case 'g':
		case 'ml':
			if (value < 10) return nearest(value, 0.5);
			return value < 100 ? Math.round(value) : nearest(value, value < 1000 ? 5 : 10);
		case 'kg':
		case 'l':
			return nearest(value, 0.05);
		case 'oz':
			return nearest(value, value < 4 ? 0.25 : 0.5);
		case 'lb':
		case 'tbsp':
			return nearest(value, 0.25);
		case 'floz':
			return nearest(value, 0.5);
		case 'tsp':
			return nearest(value, value < 1 ? 0.125 : 0.25);
		case 'cup': {
			const whole = Math.floor(value);
			const grid = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1].map((part) => whole + part);
			return grid.reduce((best, next) =>
				Math.abs(next - value) < Math.abs(best - value) ? next : best
			);
		}
		default:
			return value;
	}
}

/** Text for an amount shown in a unit the recipe was not written in, e.g. "1½ cups" or "2-3 tbsp". */
export function formatShown(min: number, max: number, unit: Unit): string {
	const decimal = unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l';
	const [low, high] = [roundFor(min, unit), roundFor(max, unit)];
	const number = (value: number) => formatNumber(value, decimal);
	const label = unit === 'cup' && high > 1 ? 'cups' : unitLabel(unit);
	return low === high ? `${number(high)} ${label}` : `${number(low)}-${number(high)} ${label}`;
}

const AMOUNT =
	/(?:\d[\d.,]*|[⅛¼⅓½⅔¾])[⅛¼⅓½⅔¾]?(?:\s?[\u2013-]\s?(?:\d[\d.,]*|[⅛¼⅓½⅔¾])[⅛¼⅓½⅔¾]?)?(?:\s?(?:g|kg|ml|l|tsp|tbsp|cups?|oz|lb|fl oz|pinch(?:es)?)\b)?/;

/** Splits a line around its first amount, so the amount can use the numeral face. */
export function splitAmount(text: string): [string, string, string] {
	const found = AMOUNT.exec(text);
	if (!found) return [text, '', ''];
	return [text.slice(0, found.index), found[0], text.slice(found.index + found[0].length)];
}

export const recipesText = (count: number): string => (count === 1 ? 'recipe' : 'recipes');
