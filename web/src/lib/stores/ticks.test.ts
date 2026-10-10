import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Ticks, ticksKey } from './ticks.svelte';

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
