import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson, readList, readStorage, writeJson, writeStorage } from './storage';
import { favourites } from './favourites.svelte';
import { Notes, notesKey } from './notes.svelte';
import { preferences } from './preferences.svelte';
import { RECENT_KEY, RECENT_LIMIT, recent } from './recent.svelte';
import { SHOPPING_KEY, shopping } from './shopping.svelte';

const spies: { mockRestore(): void }[] = [];

const blockStorage = () => {
	const fail = () => {
		throw new DOMException('blocked', 'SecurityError');
	};
	for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
		spies.push(vi.spyOn(Storage.prototype, method).mockImplementation(fail));
	}
};

beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
});

afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
	vi.useRealTimers();
});

describe('the storage wrappers when storage throws', () => {
	it('read as empty and write without throwing', () => {
		blockStorage();
		expect(readStorage('k')).toBeNull();
		expect(readJson('k')).toBeUndefined();
		expect(readList('k')).toEqual([]);
		expect(() => writeStorage('k', 'v')).not.toThrow();
		expect(() => writeStorage('k', null)).not.toThrow();
		expect(() => writeJson('k', { a: 1 })).not.toThrow();
	});

	it('read corrupt JSON as missing', () => {
		localStorage.setItem('k', '{nope');
		expect(readJson('k')).toBeUndefined();
		localStorage.setItem('k', '{"a":1}');
		expect(readJson('k')).toEqual({ a: 1 });
	});
});

describe('notes', () => {
	it('autosave after a pause in typing and load back', () => {
		const notes = new Notes('a/one');
		notes.set('Less salt');
		expect(localStorage.getItem(notesKey('a/one'))).toBeNull();
		vi.advanceTimersByTime(500);
		expect(localStorage.getItem(notesKey('a/one'))).toBe('Less salt');

		const later = new Notes('a/one');
		later.load();
		expect(later.text).toBe('Less salt');
	});

	it('are saved at once on flush, and an emptied note removes the entry', () => {
		const notes = new Notes('a/one');
		notes.set('x');
		notes.flush();
		expect(localStorage.getItem(notesKey('a/one'))).toBe('x');
		notes.set('   ');
		notes.flush();
		expect(localStorage.getItem(notesKey('a/one'))).toBeNull();
	});

	it('keep working for the visit when storage is blocked', () => {
		blockStorage();
		const notes = new Notes('a/one');
		notes.load();
		expect(() => {
			notes.set('kept in memory');
			vi.advanceTimersByTime(500);
		}).not.toThrow();
		expect(notes.text).toBe('kept in memory');
	});
});

describe('recently viewed', () => {
	it('keeps the newest first, without repeats, up to the limit', () => {
		for (let n = 0; n < RECENT_LIMIT + 3; n++) recent.add(`r/${n}`);
		recent.add('r/5');
		expect(recent.ids).toHaveLength(RECENT_LIMIT);
		expect(recent.ids[0]).toBe('r/5');
		expect(new Set(recent.ids).size).toBe(RECENT_LIMIT);
		recent.ids = [];
		recent.load();
		expect(recent.ids[0]).toBe('r/5');
		expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')).toHaveLength(RECENT_LIMIT);
	});

	it('does not throw when storage is blocked', () => {
		blockStorage();
		expect(() => recent.add('r/1')).not.toThrow();
	});
});

describe('favourites', () => {
	it('list the saved ids in order', () => {
		favourites.toggle('a/x');
		favourites.toggle('a/y');
		expect(favourites.ids.slice(-2)).toEqual(['a/x', 'a/y']);
		favourites.toggle('a/x');
		favourites.toggle('a/y');
		expect(favourites.ids).not.toContain('a/x');
	});
});

describe('the step hint', () => {
	it('is dismissed for good once, whether closed or used', () => {
		expect(preferences.stepHintDismissed).toBe(false);
		preferences.dismissStepHint();
		preferences.dismissStepHint();
		expect(preferences.stepHintDismissed).toBe(true);
		expect(readStorage('sapori:hint:steps')).toBe('1');
	});
});

describe('the shopping list', () => {
	const item = (name: string) => ({ item: name, min: 1, max: 1, unit: null });
	const entry = (id: string, ...names: string[]) => ({
		id,
		title: id,
		serves: '4 servings',
		items: names.map(item)
	});

	beforeEach(() => shopping.clearAll());

	it('replaces a recipe added again and persists', () => {
		shopping.add(entry('a', 'egg'));
		shopping.add(entry('a', 'egg', 'milk'));
		expect(shopping.recipes).toHaveLength(1);
		expect(shopping.count).toBe(2);
		const stored = JSON.parse(localStorage.getItem(SHOPPING_KEY) ?? '{}');
		expect(stored.recipes[0].items).toHaveLength(2);

		shopping.recipes = [];
		shopping.load();
		expect(shopping.has('a')).toBe(true);
	});

	it('clears ticked lines and drops recipes left empty', () => {
		shopping.add(entry('a', 'egg'));
		shopping.add(entry('b', 'egg', 'milk'));
		shopping.toggle('text:egg|');
		expect(shopping.isTicked('text:egg|')).toBe(true);
		shopping.clearTicked();
		expect(shopping.recipes.map((recipe) => recipe.id)).toEqual(['b']);
		expect(shopping.recipes[0].items.map((line) => line.item)).toEqual(['milk']);
		expect(shopping.ticked).toEqual([]);
	});

	it('clears everything', () => {
		shopping.add(entry('a', 'egg'));
		shopping.clearAll();
		expect(shopping.count).toBe(0);
		expect(localStorage.getItem(SHOPPING_KEY)).toContain('"recipes":[]');
	});

	it('ignores corrupt stored data and works with storage blocked', () => {
		localStorage.setItem(SHOPPING_KEY, '{"recipes":[{"id":1}],"ticked":[3]}');
		shopping.load();
		expect(shopping.recipes).toEqual([]);
		expect(shopping.ticked).toEqual([]);

		blockStorage();
		shopping.load();
		expect(() => shopping.add(entry('a', 'egg'))).not.toThrow();
		expect(shopping.count).toBe(1);
	});
});
