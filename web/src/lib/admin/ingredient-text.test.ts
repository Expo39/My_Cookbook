// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore } from '$lib/core';
import { groupsToText, rowToLine, textToGroups } from './ingredient-text';
import { emptyGroup, emptyRow } from './recipe-form';

beforeAll(async () => {
	await loadCore(readFileSync(new URL('../wasm/cookbook_wasm_bg.wasm', import.meta.url)));
});

const row = (extra: Partial<ReturnType<typeof emptyRow>>) => ({ ...emptyRow(), ...extra });

describe('rowToLine', () => {
	it('writes a row the way a cook would', () => {
		expect(rowToLine(row({ qtyMin: '400', unit: 'g', item: 'plain flour' }))).toBe(
			'400 g plain flour'
		);
		expect(
			rowToLine(row({ qtyMin: '2', qtyMax: '3', item: 'garlic cloves', note: 'crushed' }))
		).toBe('2-3 garlic cloves, crushed');
		expect(rowToLine(row({ prefix: 'Zest of', qtyMin: '1', item: 'lemon' }))).toBe(
			'Zest of 1 lemon'
		);
		expect(rowToLine(row({ item: 'salt', scale: 'toTaste' }))).toBe('salt to taste');
		expect(rowToLine(row({ qtyMin: '1', unit: 'tbsp', item: 'honey', optional: true }))).toBe(
			'1 tbsp honey (optional)'
		);
		expect(rowToLine(row({ qtyMin: '4', unit: 'floz', item: 'milk' }))).toBe('4 fl oz milk');
	});
});

describe('textToGroups', () => {
	it('reads each line, tidying bullets, numbers and spaces', () => {
		const [group] = textToGroups('1.  400g   plain flour\n\u2022 2 eggs\n\n- salt to taste', [
			emptyGroup()
		]);
		expect(group.name).toBe('');
		expect(group.items.map((item) => [item.qtyMin, item.unit, item.item, item.scale])).toEqual([
			['400', 'g', 'plain flour', 'linear'],
			['2', '', 'eggs', 'discrete'],
			['', '', 'salt', 'toTaste']
		]);
	});

	it('starts a part at a line ending in a colon', () => {
		const groups = textToGroups('200 g flour\nFor the filling:\n500 g ricotta', [emptyGroup()]);
		expect(groups.map((group) => [group.name, group.items.map((item) => item.item)])).toEqual([
			['', ['flour']],
			['For the filling', ['ricotta']]
		]);
	});

	it('keeps a line it cannot split as the name, so nothing is lost', () => {
		const [group] = textToGroups('200 g', [emptyGroup()]);
		expect(group.items[0].item).toBe('200 g');
	});

	it('keeps what the list cannot show for a line that still reads the same', () => {
		const flour = row({ qtyMin: '400', unit: 'g', item: 'flour', key: 'flour', scale: 'fixed' });
		const previous = [{ ...emptyGroup(), items: [flour] }];
		const [group] = textToGroups(`${rowToLine(flour)}\n2 eggs`, previous);
		expect(group.items[0]).toMatchObject({ uid: flour.uid, key: 'flour', scale: 'fixed' });
		expect(group.items[1].key).toBe('');
	});

	it("keeps a part's total by its name, and never gives two parts the same identity", () => {
		const filling = { ...emptyGroup(), name: 'Filling', totalQty: '1150', totalUnit: 'g' as const };
		const groups = textToGroups('Filling:\n500 g ricotta\nFilling:\n2 eggs', [filling]);
		expect(groups[0]).toMatchObject({ uid: filling.uid, totalQty: '1150' });
		expect(groups[1].uid).not.toBe(filling.uid);
	});

	it('gives an empty list one empty part rather than none', () => {
		const groups = textToGroups('  \n\n', [emptyGroup()]);
		expect(groups).toHaveLength(1);
		expect(groups[0].items).toEqual([]);
	});

	it('reads back what it writes', () => {
		const text =
			'Zest of 1 lemon\n2-3 garlic cloves, crushed\nFor the sauce:\n1 tbsp honey (optional)';
		const groups = textToGroups(text, [emptyGroup()]);
		expect(groupsToText(groups)).toBe(
			'Zest of 1 lemon\n2-3 garlic cloves, crushed\n\nFor the sauce:\n1 tbsp honey (optional)'
		);
		expect(groupsToText(textToGroups(groupsToText(groups), groups))).toBe(groupsToText(groups));
	});
});
