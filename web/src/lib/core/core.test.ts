// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	checkRecipe,
	checkRemoval,
	convert,
	formatTemperature,
	servingsLabel,
	isCoreLoaded,
	loadCore,
	parseIngredientLine,
	qrMatrix,
	scaleRecipe,
	toggleUnit,
	version,
	type Recipe
} from './index';

const fixture: Recipe = {
	title: 'Lentil soup',
	summary: 'A thick, warming soup.',
	servings: 4,
	times: { prep: 10, cook: 35 },
	ingredientGroups: [
		{
			items: [
				{ key: 'lentils', food: 'lentils', amount: { qty: 250, unit: 'g' }, item: 'red lentils' },
				{ key: 'stock', amount: { qty: 1, unit: 'l' }, item: 'vegetable stock' }
			]
		}
	],
	steps: [{ text: 'Simmer {@lentils} in {@stock} at {temp:200/180} for {timer:25-30}.' }]
};

beforeAll(async () => {
	await loadCore(readFileSync(new URL('../wasm/cookbook_wasm_bg.wasm', import.meta.url)));
});

describe('the WASM core', () => {
	it('is loaded once and reports a version', () => {
		expect(isCoreLoaded()).toBe(true);
		expect(version()).toMatch(/^\d+\.\d+\.\d+/);
	});

	it('scales by servings and renders the method', () => {
		const view = scaleRecipe(fixture, { servings: 8 });
		expect(view.factor).toBe(2);
		expect(view.groups[0].items[0].text).toBe('500 g red lentils');
		const segments = view.steps[0].segments;
		expect(segments.some((s) => s.type === 'timer')).toBe(true);
	});

	it('defaults to the written servings and honours the unit system', () => {
		expect(scaleRecipe(fixture).factor).toBe(1);
		const us = scaleRecipe(fixture, { multiplier: 1 }, { system: 'us' });
		expect(us.steps[0].text).toContain('°F');
	});

	it('rejects a malformed recipe', () => {
		expect(() => scaleRecipe({ title: 'x' } as unknown as Recipe)).toThrow();
	});

	it('parses ingredient lines and reports the ones without a name', () => {
		const parsed = parseIngredientLine('250 g red lentils');
		expect(parsed.item).toBe('red lentils');
		expect(parsed.amount).toEqual({ qty: 250, unit: 'g' });
		expect(() => parseIngredientLine('')).toThrow(/empty/);
	});

	it('checks a recipe against the context', () => {
		const clean = checkRecipe(fixture, 'mains/lentil-soup', {
			knownIds: ['mains/lentil-soup'],
			sectionFolders: ['mains']
		});
		expect(clean.filter((r) => r.level === 'error')).toEqual([]);
		const broken = structuredClone(fixture);
		broken.steps[0].text = 'Add {@missing}.';
		const results = checkRecipe(broken, 'mains/lentil-soup', {
			knownIds: ['mains/lentil-soup'],
			sectionFolders: ['mains']
		});
		expect(results.map((r) => r.id)).toContain('E-TOKEN-UNRESOLVED');
	});

	it('blocks the removal of a recipe that others link to', () => {
		const linking = { ...fixture, related: ['mains/lentil-soup'] };
		const results = checkRemoval('mains/lentil-soup', [
			{ path: 'mains/stew.json', recipe: linking },
			{ path: 'mains/lentil-soup.json', recipe: fixture }
		]);
		expect(results.map((r) => r.recipe)).toEqual(['mains/stew']);
	});

	it('converts and toggles units and formats temperatures', () => {
		expect(convert(1, 'kg', 'g')).toBe(1000);
		expect(toggleUnit(500, 'g')?.unit).not.toBe('g');
		expect(toggleUnit(1, 'pinch')).toBeUndefined();
		expect(formatTemperature(200, 'metric', 180)).toBe('200 °C (180 °C fan)');
		expect(formatTemperature(200, 'us')).toMatch(/°F$/);
		expect(formatTemperature(52, 'metric', undefined, { maxCelsius: 55, internal: true })).toBe(
			'52–55 °C'
		);
		expect(formatTemperature(52, 'us', undefined, { maxCelsius: 55, internal: true })).toBe(
			'126–131 °F'
		);
	});

	it('draws QR codes as a square of modules', () => {
		const qr = qrMatrix('https://example.test/r/soup?serves=6');
		expect(qr?.dark).toHaveLength((qr?.size ?? 0) ** 2);
		expect(qr?.dark[0]).toBe(true);
		expect(qrMatrix('x'.repeat(4000))).toBeUndefined();
	});

	it('labels servings with singular and plural nouns', () => {
		expect(servingsLabel(1, { one: 'person', other: 'people' })).toBe('1 person');
		expect(servingsLabel(4, { one: 'person', other: 'people' })).toBe('4 people');
		expect(servingsLabel(6, 'boards')).toBe('6 boards');
		expect(servingsLabel(1)).toBe('1 serving');
	});
});
