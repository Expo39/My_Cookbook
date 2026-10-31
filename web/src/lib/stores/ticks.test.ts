import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ingredientTick, stepTick, Ticks, ticksKey } from './ticks.svelte';

beforeEach(() => localStorage.clear());

describe('tick persistence', () => {
	it('remembers ticks for a recipe between visits', () => {
		const first = new Ticks('soups/tomato');
		first.toggle('i:0.1');
		first.toggle('s:2');

		const second = new Ticks('soups/tomato');
		second.load();
		expect(second.has('i:0.1')).toBe(true);
		expect(second.has('s:2')).toBe(true);
		expect(second.has('i:0.0')).toBe(false);
	});

	it('follows a checkbox exactly, however often the same state arrives', () => {
		const ticks = new Ticks('soups/tomato');
		ticks.set('i:0.1', true);
		ticks.set('i:0.1', true);
		expect(ticks.has('i:0.1')).toBe(true);
		ticks.set('i:0.1', false);
		ticks.set('i:0.1', false);
		expect(ticks.has('i:0.1')).toBe(false);
		ticks.toggle('i:0.1');
		expect(ticks.has('i:0.1')).toBe(true);
	});

	it('keeps each recipe separate', () => {
		new Ticks('a/one').toggle('i:0.0');
		const other = new Ticks('a/two');
		other.load();
		expect(other.has('i:0.0')).toBe(false);
	});

	it('counts and clears by prefix, and removes the entry when empty', () => {
		const ticks = new Ticks('a/one');
		ticks.toggle('i:0.0');
		ticks.toggle('i:0.1');
		ticks.toggle('s:1');
		expect(ticks.count('i:')).toBe(2);
		ticks.clear('i:');
		expect(ticks.count('i:')).toBe(0);
		expect(ticks.has('s:1')).toBe(true);
		ticks.toggle('s:1');
		expect(localStorage.getItem(ticksKey('a/one'))).toBeNull();
	});

	it('works for the visit when storage is blocked', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		const ticks = new Ticks('a/one');
		ticks.load();
		expect(() => ticks.toggle('i:0.0')).not.toThrow();
		expect(ticks.has('i:0.0')).toBe(true);
		vi.restoreAllMocks();
	});

	it('ignores corrupt stored data', () => {
		localStorage.setItem(ticksKey('a/one'), '{not json');
		const ticks = new Ticks('a/one');
		ticks.load();
		expect(ticks.count('')).toBe(0);
	});
});

describe('what a tick is attached to', () => {
	it('follows an ingredient by key or by name in its group, never by its amount', () => {
		expect(ingredientTick({ name: 'Sauce' }, { key: 'oil', item: 'olive oil' })).toBe('i:oil');
		expect(ingredientTick({ name: 'Sauce' }, { item: ' Salt ' })).toBe('i:Sauce/salt');
		expect(ingredientTick({}, { item: 'salt' })).not.toBe(
			ingredientTick({ name: 'Sauce' }, { item: 'salt' })
		);
	});

	it('follows a step by key, or by its text, so an inserted step moves nothing', () => {
		const steps = ['Boil the water.', 'Add the pasta.'];
		const before = steps.map((text) => stepTick({ text }));
		const after = ['Salt the water.', ...steps].map((text) => stepTick({ text }));
		expect(after.slice(1)).toEqual(before);
		expect(new Set(after).size).toBe(3);
		expect(stepTick({ key: 'rest', text: 'Rest it.' })).toBe('s:rest');
	});

	it('counts only the ticks for lines the recipe still has', () => {
		const ticks = new Ticks('a/one');
		ticks.toggle('i:gone');
		ticks.toggle('i:oil');
		expect(ticks.countOf(['i:oil', 'i:salt'])).toBe(1);
	});
});
