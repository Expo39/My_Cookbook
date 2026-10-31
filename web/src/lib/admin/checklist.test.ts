import { describe, expect, it } from 'vitest';
import type { CheckResult } from '$lib/types/recipe';
import { plainWords, summarise } from './checklist';

const result = (id: string, path = '', message = id): CheckResult => ({
	id,
	level: 'error',
	message,
	path,
	recipe: 'a/b'
});

describe('plainWords', () => {
	it('says what to do in plain words', () => {
		expect(plainWords(result('E-SCHEMA-BLANK', 'title'))).toBe('Give the recipe a name.');
		expect(plainWords(result('E-SCHEMA-BLANK', 'steps[2].text'))).toBe(
			'Step 3 is empty. Write it, or remove it.'
		);
		expect(plainWords(result('W-BRITISH-SPELLING', 'summary', "'color' should be 'colour'"))).toBe(
			'"color" is spelt "colour" in this cookbook.'
		);
	});

	it('keeps any other message, as a sentence', () => {
		expect(plainWords(result('E-KEY-FORMAT', '', 'keys may only use letters'))).toBe(
			'Keys may only use letters.'
		);
	});
});

describe('summarise', () => {
	it.each([
		[0, 'Ready to save'],
		[1, 'One thing left to fill in'],
		[4, '4 things left to fill in']
	])('%i left reads "%s"', (left, text) => {
		expect(summarise(left)).toBe(text);
	});
});
