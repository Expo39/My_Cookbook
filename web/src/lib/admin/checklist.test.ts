import { describe, expect, it } from 'vitest';
import type { CheckResult } from '$lib/types/recipe';
import { checkGroups, summarise } from './checklist';

const result = (id: string, level: CheckResult['level'] = 'error'): CheckResult => ({
	id,
	level,
	message: id,
	path: '',
	recipe: 'a/b'
});

describe('checkGroups', () => {
	it('ticks every group when nothing failed', () => {
		const groups = checkGroups([]);
		expect(groups.map((g) => g.label)).toEqual([
			'Details and address',
			'Amounts and scaling',
			'Method and linked steps',
			'Photo and related recipes',
			'Advice'
		]);
		expect(groups.every((g) => g.results.length === 0)).toBe(true);
	});

	it('files each result under its group', () => {
		const groups = checkGroups([
			result('E-QTY-POSITIVE'),
			result('E-SCALING-RANGE'),
			result('E-TOKEN-UNRESOLVED'),
			result('E-IMAGE-ALT'),
			result('E-RELATED-UNRESOLVED'),
			result('W-TIME-MISSING', 'warning'),
			result('E-SLUG-FORMAT'),
			result('F-NUMBER')
		]);
		const ids = (name: string) => groups.find((g) => g.id === name)?.results.map((r) => r.id);
		expect(ids('amounts')).toEqual(['E-QTY-POSITIVE', 'E-SCALING-RANGE']);
		expect(ids('method')).toEqual(['E-TOKEN-UNRESOLVED']);
		expect(ids('links')).toEqual(['E-IMAGE-ALT', 'E-RELATED-UNRESOLVED']);
		expect(ids('advice')).toEqual(['W-TIME-MISSING']);
		expect(ids('basics')).toEqual(['E-SLUG-FORMAT', 'F-NUMBER']);
	});
});

describe('summarise', () => {
	it.each([
		[0, 0, 'Every check passes'],
		[1, 3, '1 problem to fix before saving'],
		[2, 0, '2 problems to fix before saving'],
		[0, 1, 'Ready to save, with 1 suggestion'],
		[0, 4, 'Ready to save, with 4 suggestions']
	])('reads %i errors and %i warnings as %j', (errors, warnings, text) => {
		expect(summarise(errors, warnings)).toBe(text);
	});
});
