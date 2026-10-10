import { describe, expect, it } from 'vitest';
import { ellipsize, fitLines, ingredientWindow, wrap, type Measure } from './text';

/** Every character is as wide as the font size, so the widths are easy to reason about. */
const mono: Measure = (_face, size, text) => [...text].length * size;

describe('wrap', () => {
	it('fills each line greedily', () => {
		expect(wrap(mono, 'body', 1, 'aa bb cc dd', 5)).toEqual(['aa bb', 'cc dd']);
	});

	it('gives a word that is too wide a line of its own', () => {
		expect(wrap(mono, 'body', 1, 'abcdefgh ij', 5)).toEqual(['abcdefgh', 'ij']);
	});

	it('collapses runs of whitespace', () => {
		expect(wrap(mono, 'body', 1, '  aa \n bb  ', 10)).toEqual(['aa bb']);
	});
});

describe('ellipsize', () => {
	it('cuts to the width and leaves short text alone', () => {
		expect(ellipsize(mono, 'body', 1, 'abcdefgh', 5)).toBe('ab...');
		expect(ellipsize(mono, 'body', 1, 'abc', 5)).toBe('abc');
	});

	it('does not leave a space before the ellipsis', () => {
		expect(ellipsize(mono, 'body', 1, 'ab cdefgh', 4)).toBe('a...');
	});
});

describe('fitLines', () => {
	it('shrinks the type before it cuts the text', () => {
		const fitted = fitLines(mono, 'display', [2, 1], 'aaaa bbbb cccc', 10, 2);
		expect(fitted.size).toBe(1);
		expect(fitted.lines).toHaveLength(2);
	});

	it('ends the last line with an ellipsis when nothing fits', () => {
		const fitted = fitLines(mono, 'display', [2, 1], 'aaaa bbbb cccc dddd eeee', 10, 2);
		expect(fitted.size).toBe(1);
		expect(fitted.lines).toHaveLength(2);
		expect(fitted.lines[1].endsWith('...')).toBe(true);
	});

	it('keeps the biggest size that fits', () => {
		expect(fitLines(mono, 'display', [2, 1], 'ab', 10, 1)).toEqual({ size: 2, lines: ['ab'] });
	});
});

describe('ingredientWindow', () => {
	it('shows everything that fits', () => {
		expect(ingredientWindow(5, 8, 12)).toEqual({ shown: 5, more: 0 });
	});

	it('spends the last line on the remainder', () => {
		expect(ingredientWindow(20, 8, 12)).toEqual({ shown: 7, more: 13 });
		expect(ingredientWindow(20, 30, 12)).toEqual({ shown: 11, more: 9 });
	});

	it('shows only the remainder when there is room for one line or none', () => {
		expect(ingredientWindow(3, 1, 12)).toEqual({ shown: 0, more: 3 });
		expect(ingredientWindow(3, 0, 12)).toEqual({ shown: 0, more: 3 });
	});
});
