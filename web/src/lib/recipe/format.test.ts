// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, servingsLabel } from '$lib/core';
import { formatMinutes, formatNumber, formatShown, isoDuration, servingsText } from './format';

beforeAll(async () => {
	await loadCore(readFileSync(new URL('../wasm/cookbook_wasm_bg.wasm', import.meta.url)));
});

describe('servings text', () => {
	it.each([
		[1, undefined],
		[4, undefined],
		[1, { one: 'person', other: 'people' }],
		[6, { one: 'person', other: 'people' }],
		[12, 'boards'],
		[1.5, 'boards'],
		[2.5, undefined]
	] as const)('matches the core for %s and %j', (servings, noun) => {
		expect(servingsText(servings, noun)).toBe(servingsLabel(servings, noun));
	});
});

describe('formatting', () => {
	it('writes durations for people and for schema.org', () => {
		expect(formatMinutes(25)).toBe('25 min');
		expect(formatMinutes(90)).toBe('1 h 30 min');
		expect(formatMinutes(360)).toBe('6 h');
		expect(isoDuration(0)).toBe('PT0M');
		expect(isoDuration(360)).toBe('PT6H');
		expect(isoDuration(95)).toBe('PT1H35M');
	});

	it('uses fractions outside metric and decimals inside it', () => {
		expect(formatNumber(1.5)).toBe('1½');
		expect(formatNumber(0.25)).toBe('¼');
		expect(formatNumber(1.25, true)).toBe('1.25');
	});

	it('rounds a cycled amount to something a cook can measure', () => {
		expect(formatShown(500, 500, 'g')).toBe('500 g');
		expect(formatShown(1.254, 1.254, 'kg')).toBe('1.25 kg');
		expect(formatShown(17.64, 17.64, 'oz')).toBe('17½ oz');
		expect(formatShown(1.33, 1.33, 'cup')).toBe('1⅓ cups');
		expect(formatShown(0.97, 0.97, 'cup')).toBe('1 cup');
		expect(formatShown(2.1, 3.2, 'tbsp')).toBe('2-3¼ tbsp');
		expect(formatShown(4, 4, 'floz')).toBe('4 fl oz');
		expect(formatShown(0.01, 0.01, 'g')).toBe('0.5 g');
	});
});
