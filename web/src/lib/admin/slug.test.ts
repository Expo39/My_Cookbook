import { describe, expect, it } from 'vitest';
import { isSlug, slugify, suggestKey } from './slug';

describe('slugify', () => {
	it.each([
		['Beef Wellington', 'beef-wellington'],
		["Nanna's Pastizzi", 'nannas-pastizzi'],
		['Crème brûlée', 'creme-brulee'],
		['Salt & pepper', 'salt-and-pepper'],
		['  --Spaghetti   al  limone--  ', 'spaghetti-al-limone'],
		['100% *wow*', '100-wow'],
		['', '']
	])('turns %j into %j', (title, slug) => {
		expect(slugify(title)).toBe(slug);
	});

	it('always produces something isSlug accepts, unless it is empty', () => {
		for (const title of ['Ħobż biż-żejt', 'A  B', '9 lives']) {
			const slug = slugify(title);
			expect(slug === '' || isSlug(slug)).toBe(true);
		}
	});
});

describe('isSlug', () => {
	it.each(['pasta', 'one-pot-pasta', 'a1-b2'])('accepts %s', (slug) => {
		expect(isSlug(slug)).toBe(true);
	});

	it.each(['', 'Pasta', '-pasta', 'pasta-', 'one--pot', 'one pot', 'a/b'])('rejects %j', (slug) => {
		expect(isSlug(slug)).toBe(false);
	});
});

describe('suggestKey', () => {
	it('uses the last word of the name', () => {
		expect(suggestKey('short pasta', [])).toBe('pasta');
	});

	it('numbers a key that is taken', () => {
		expect(suggestKey('penne pasta', ['pasta', 'pasta-2'])).toBe('pasta-3');
	});

	it('falls back for a name with no usable letters', () => {
		expect(suggestKey('???', [])).toBe('ingredient');
	});
});
