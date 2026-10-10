// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { convert, loadCore } from '$lib/core';
import { lineText, mergeLines } from './shopping';

beforeAll(async () => {
	await loadCore(readFileSync(new URL('../wasm/cookbook_wasm_bg.wasm', import.meta.url)));
});

it('sums a metric and a US amount of the same food with the real converter', () => {
	const [line] = mergeLines(
		[
			{
				id: 'a',
				title: 'A',
				serves: '4 servings',
				items: [{ food: 'flour-00', item: 'flour', min: 240, max: 240, unit: 'g' }]
			},
			{
				id: 'b',
				title: 'B',
				serves: '4 servings',
				items: [{ food: 'flour-00', item: 'flour', min: 1, max: 1, unit: 'cup' }]
			}
		],
		convert
	);
	expect(line.unit).toBe('g');
	expect(line.min).toBeGreaterThan(300);
	expect(lineText(line)).toMatch(/^\d+ g flour$/);
});
