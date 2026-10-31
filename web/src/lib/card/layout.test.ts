import { describe, expect, it } from 'vitest';
import { cardContent } from './content';
import { compose, layout, planList, splitAmount, type Content, type Op } from './layout';
import { qrPath } from './qr';
import type { Measure } from './text';
import type { Recipe, RecipeCard, ScaledRecipe } from '$lib/types/recipe';

/** Half an em per character: close to a real text face, and easy to reason about. */
const measure: Measure = (_face, size, text) => [...text].length * size * 0.5;

const qr = { size: 21, dark: Array.from({ length: 441 }, (_, i) => i % 3 === 0) };

const content = (extra: Partial<Content> = {}): Content => ({
	label: 'Main courses / Beef & steak',
	title: 'Beef Wellington',
	serves: '5 servings',
	total: '1 h 55 min',
	ingredients: Array.from({ length: 30 }, (_, i) => ({
		amount: `${i + 1} g`,
		rest: `item ${i + 1}`
	})),
	qr,
	urlText: 'example.test/cookbook',
	hasPhoto: false,
	...extra
});

type TextOp = Extract<Op, { kind: 'text' }>;
const texts = (ops: Op[]) => ops.filter((op): op is TextOp => op.kind === 'text');

describe('the sheet layout', () => {
	const format = layout.formats.portrait;
	const list = (length: number) =>
		Array.from({ length }, (_, i) => ({ amount: `${i + 1} g`, rest: `item ${i + 1}` }));
	const linesFor = (length: number) =>
		texts(compose(format, content({ ingredients: list(length) }), measure)).map((op) => op.text);
	const ops = compose(format, content({ ingredients: list(80) }), measure);

	it.each([14, 24])('shows all %i ingredients, shrinking or pairing the lines', (length) => {
		const lines = linesFor(length);
		expect(lines.filter((line) => /^item \d+$/.test(line))).toHaveLength(length);
		expect(lines.some((line) => /more$/.test(line))).toBe(false);
	});

	it('says how many ingredients are left out', () => {
		const lines = texts(ops).map((op) => op.text);
		expect(lines.at(-1)).not.toBe('+ 0 more');
		const more = lines.find((line) => /^\+ \d+ more$/.test(line));
		const shown = lines.filter((line) => /^item \d+$/.test(line)).length;
		expect(more).toBe(`+ ${80 - shown} more`);
		expect(shown).toBeGreaterThan(0);
	});

	it('keeps the ingredient list clear of the footer', () => {
		const qrBox = ops.find((op) => op.kind === 'qr');
		const listBottom = Math.max(
			...texts(ops)
				.filter((op) => /^item \d+$|^\+ \d+ more$/.test(op.text))
				.map((op) => op.y)
		);
		expect(qrBox && listBottom < qrBox.y).toBe(true);
	});

	it('draws the QR code inside the card with a whole number of pixels per module', () => {
		const code = ops.find((op) => op.kind === 'qr');
		expect(code?.kind === 'qr' && Number.isInteger(code.module)).toBe(true);
		expect(code && code.kind === 'qr' && code.x + code.module * qr.size <= format.width).toBe(true);
	});

	it('shows no method text, only a prompt to scan', () => {
		const lines = texts(ops).map((op) => op.text);
		expect(lines).toContain(layout.qrNote);
	});

	it('shrinks a long title instead of overflowing it', () => {
		const long = compose(
			format,
			content({ title: 'Creamy Pancetta and Mushroom Tagliatelle with Fresh Sage' }),
			measure
		);
		const titles = texts(long).filter((op) => op.face === 'display' && op.size > 50);
		expect(titles.length).toBeGreaterThan(1);
		expect(titles.length).toBeLessThanOrEqual(layout.sheet.titleLines);
	});

	it('keeps the story clear of the top and bottom safe zones', () => {
		const story = layout.formats.story;
		const text = texts(compose(story, content(), measure));
		expect(Math.min(...text.map((op) => op.y))).toBeGreaterThan(story.safeTop);
		expect(Math.max(...text.map((op) => op.y))).toBeLessThan(story.height - story.safeBottom);
	});

	it('puts a photo band at the top with the title on a solid block right below it', () => {
		const photo = compose(format, content({ hasPhoto: true }), measure);
		expect(photo[0]).toMatchObject({ kind: 'photo', x: 0, y: 0, w: format.width });
		expect(photo[1]).toMatchObject({ kind: 'rect', fill: layout.palette.ink, opacity: 1 });
		const [band, block] = photo;
		expect(band.kind === 'photo' && block.kind === 'rect' && band.h === block.y).toBe(true);
		expect(ops[0]).toMatchObject({ kind: 'rect', fill: layout.palette.primary });
	});

	it('sets the total time and servings in the numeral face, and drops a missing time', () => {
		const meta = (extra?: Partial<Content>) =>
			texts(compose(format, content(extra), measure)).find(
				(op) => op.face === 'num' && /servings/.test(op.text)
			);
		expect(meta()?.text).toBe('1 h 55 min  |  5 servings');
		expect(meta({ total: undefined })?.text).toBe('5 servings');
	});
});

describe('the banner layout', () => {
	const banner = compose(layout.formats.og, content(), measure);

	it('has no ingredient list and no QR code', () => {
		expect(banner.some((op) => op.kind === 'qr')).toBe(false);
		expect(texts(banner).some((op) => op.text === 'INGREDIENTS')).toBe(false);
	});

	it('sets the times and servings in the numeral face', () => {
		const meta = texts(banner).find((op) => op.text.includes('servings'));
		expect(meta?.face).toBe('num');
		expect(meta?.text).toBe('1 h 55 min  |  5 servings');
	});
});

describe('splitAmount', () => {
	it('splits the amount from the rest of the line', () => {
		expect(splitAmount('130 ml (9 tbsp) olive oil', '130 ml')).toEqual({
			amount: '130 ml',
			rest: '(9 tbsp) olive oil'
		});
		expect(splitAmount('Olive oil', undefined)).toEqual({ amount: '', rest: 'Olive oil' });
		expect(splitAmount('Salt to taste', '2 g')).toEqual({ amount: '', rest: 'Salt to taste' });
	});
});

describe('cardContent', () => {
	const recipe = {
		title: 'Soup',
		titleLocal: 'Soppa',
		summary: 's',
		servings: 4,
		servingsNoun: { one: 'person', other: 'people' }
	} as unknown as Recipe;
	const view = {
		servings: 6,
		groups: [{ items: [{ text: '300 g lentils', amount: { text: '300 g' } }, { text: 'Salt' }] }]
	} as unknown as ScaledRecipe;
	const card = { id: 'mains/soup', times: { total: 90 } } as unknown as RecipeCard;

	it('reads the scaled view, not the written recipe', () => {
		const built = cardContent({
			card,
			recipe,
			view,
			section: ['Mains', 'Soups'],
			qr: null,
			hasPhoto: false
		});
		expect(built).toMatchObject({
			label: 'Mains / Soups',
			title: 'Soup',
			titleLocal: 'Soppa',
			total: '1 h 30 min',
			serves: '6 people'
		});
		expect(built.ingredients).toEqual([
			{ amount: '300 g', rest: 'lentils' },
			{ amount: '', rest: 'Salt' }
		]);
	});
});

describe('qrPath', () => {
	it('merges horizontal runs of dark modules', () => {
		const small = { size: 3, dark: [true, true, false, false, false, false, true, false, true] };
		expect(qrPath(small, 2)).toBe('M0 0h4v2h-4zM0 4h2v2h-2zM4 4h2v2h-2z');
	});
});

describe('the ingredient list on a sheet', () => {
	const format = layout.formats.portrait;
	const linesOf = (ingredients: Content['ingredients']) =>
		texts(compose(format, content({ ingredients }), measure));

	it('wraps a long ingredient under itself instead of cutting it short', () => {
		const long = 'a mix of hard, semi-soft, soft and blue cheeses from the market';
		const ops = linesOf([{ amount: '1.15 kg', rest: long }]);
		const parts = ops.filter((op) => long.includes(op.text) && op.text.length > 3);
		expect(parts.length).toBeGreaterThan(1);
		expect(parts.map((op) => op.text).join(' ')).toBe(long);
		expect(new Set(parts.map((op) => op.x)).size).toBe(1);
		expect(ops.some((op) => op.text.includes('…'))).toBe(false);
	});

	it('moves an amount too wide for its column into the words, whole', () => {
		const ops = linesOf([{ amount: '200-300 g of very finely grated', rest: 'cheese' }]);
		expect(ops.some((op) => op.text.startsWith('200-300 g of very'))).toBe(true);
		expect(ops.some((op) => op.text.includes('…'))).toBe(false);
	});

	it('runs a long list in two columns before leaving anything out', () => {
		const list = Array.from({ length: 30 }, (_, i) => ({
			amount: `${i + 1} g`,
			rest: `item ${i + 1}`
		}));
		const ops = linesOf(list);
		const items = ops.filter((op) => /^item \d+$/.test(op.text));
		expect(items).toHaveLength(30);
		expect(new Set(items.map((op) => op.x)).size).toBe(2);
		expect(ops.some((op) => /more$/.test(op.text))).toBe(false);
	});

	it('keeps an ingredient in one column and balances the two', () => {
		const list = Array.from({ length: 28 }, (_, i) => ({
			amount: '1 g',
			rest:
				i === 3 ? 'a very long ingredient that has to wrap onto a second line here' : `item ${i}`
		}));
		const plan = planList(list, 600, 900, 1, measure);
		const columns = [0, 1].map((column) =>
			plan.placed
				.filter((item) => item.column === column)
				.reduce((n, item) => n + item.parts.length, 0)
		);
		expect(Math.abs(columns[0] - columns[1])).toBeLessThanOrEqual(2);
		expect(
			plan.placed.every((item) => item.row + item.parts.length <= Math.floor(600 / plan.step))
		).toBe(true);
		expect(plan.more).toBe(0);
	});

	it('says how many are left only when even two small columns cannot hold the list', () => {
		const list = Array.from({ length: 200 }, (_, i) => ({ amount: '1 g', rest: `item ${i}` }));
		const plan = planList(list, 300, 900, 1, measure);
		expect(plan.more).toBeGreaterThan(0);
		expect(plan.placed.length + plan.more).toBe(200);
		const rows = Math.floor(300 / plan.step);
		expect(plan.moreAt.row).toBeLessThan(rows);
	});
});
