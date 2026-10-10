import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clockText, remainingMs, statusOf, type TimerState } from '$lib/kitchen/timer-math';
import { TIMERS_KEY, Timers } from './timers.svelte';

const START = new Date('2030-01-01T12:00:00Z').getTime();

beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
	vi.setSystemTime(START);
});

afterEach(() => vi.useRealTimers());

const pasta = { id: 'r#1.0', name: 'Pasta', minutes: 10 };

describe('end-timestamp maths', () => {
	const base: TimerState = {
		id: 'a',
		name: 'A',
		durationMs: 60_000,
		endAt: 100_000,
		leftMs: 60_000,
		alerted: false
	};

	it('reads the remaining time from the end, never below zero', () => {
		expect(remainingMs(base, 40_000)).toBe(60_000);
		expect(remainingMs(base, 130_000)).toBe(0);
		expect(statusOf(base, 99_999)).toBe('running');
		expect(statusOf(base, 100_000)).toBe('finished');
	});

	it('reads a paused timer from what was left', () => {
		const paused = { ...base, endAt: null, leftMs: 12_345 };
		expect(statusOf(paused, 1e9)).toBe('paused');
		expect(remainingMs(paused, 1e9)).toBe(12_345);
	});

	it('rounds the clock up so a running timer never shows 0:00', () => {
		expect(clockText(100)).toBe('0:01');
		expect(clockText(61_000)).toBe('1:01');
		expect(clockText(3_723_000)).toBe('1:02:03');
		expect(clockText(-5)).toBe('0:00');
	});
});

describe('the timer store', () => {
	it('counts down against the clock, not against ticks', () => {
		const timers = new Timers();
		const timer = timers.start(pasta);
		expect(timers.remaining(timer)).toBe(600_000);
		vi.advanceTimersByTime(150_000);
		expect(timers.remaining(timer)).toBe(450_000);
		expect(timers.status(timer)).toBe('running');
	});

	it('runs several timers at once and does not restart one that is already there', () => {
		const timers = new Timers();
		timers.start(pasta);
		vi.advanceTimersByTime(60_000);
		timers.start({ id: 'r#2.0', name: 'Sauce', minutes: 5 });
		const again = timers.start(pasta);
		expect(timers.list).toHaveLength(2);
		expect(timers.remaining(again)).toBe(540_000);
	});

	it('survives a reload because it is stored as an end timestamp', () => {
		const first = new Timers();
		first.start(pasta);
		vi.advanceTimersByTime(30_000);

		const reloaded = new Timers();
		reloaded.load();
		expect(reloaded.list).toHaveLength(1);
		expect(reloaded.remaining(reloaded.list[0])).toBe(570_000);
		expect(JSON.parse(localStorage.getItem(TIMERS_KEY) ?? '[]')[0].endAt).toBe(START + 600_000);
	});

	it('alerts once when a timer finishes, and announces it', () => {
		const notify = vi.fn();
		const timers = new Timers(() => Date.now(), notify);
		timers.start({ id: 'x', name: 'Eggs', minutes: 1 });
		vi.advanceTimersByTime(59_000);
		expect(notify).not.toHaveBeenCalled();
		vi.advanceTimersByTime(2_000);
		expect(notify).toHaveBeenCalledTimes(1);
		expect(timers.announcement).toBe('Eggs timer finished.');
		expect(timers.status(timers.list[0])).toBe('finished');
		vi.advanceTimersByTime(60_000);
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('alerts for a timer that ended while the page was closed, and only once', () => {
		const first = new Timers(() => Date.now(), vi.fn());
		first.start({ id: 'x', name: 'Eggs', minutes: 1 });
		vi.setSystemTime(START + 5 * 60_000);

		const notify = vi.fn();
		const reloaded = new Timers(() => Date.now(), notify);
		reloaded.load();
		expect(notify).toHaveBeenCalledTimes(1);

		const third = new Timers(() => Date.now(), notify);
		third.load();
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('pauses with what is left and resumes from it', () => {
		const timers = new Timers();
		const timer = timers.start(pasta);
		vi.advanceTimersByTime(100_000);
		timers.pause(pasta.id);
		expect(timer.endAt).toBeNull();
		vi.advanceTimersByTime(500_000);
		expect(timers.remaining(timer)).toBe(500_000);
		timers.resume(pasta.id);
		vi.advanceTimersByTime(100_000);
		expect(timers.remaining(timer)).toBe(400_000);
	});

	it('adds a minute to a running, a paused and a finished timer', () => {
		const timers = new Timers(() => Date.now(), vi.fn());
		const timer = timers.start({ id: 'a', name: 'A', minutes: 1 });
		timers.addMinute('a');
		expect(timers.remaining(timer)).toBe(120_000);
		timers.pause('a');
		timers.addMinute('a');
		expect(timers.remaining(timer)).toBe(180_000);
		timers.resume('a');
		vi.advanceTimersByTime(181_000);
		expect(timers.status(timer)).toBe('finished');
		timers.addMinute('a');
		expect(timers.status(timer)).toBe('running');
		expect(timers.remaining(timer)).toBe(60_000);
	});

	it('dismisses a timer and stops the clock when nothing is running', () => {
		const timers = new Timers();
		timers.start(pasta);
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		timers.dismiss(pasta.id);
		expect(timers.list).toHaveLength(0);
		expect(vi.getTimerCount()).toBe(0);
		expect(localStorage.getItem(TIMERS_KEY)).toBe('[]');
	});

	it('ignores corrupt stored timers', () => {
		localStorage.setItem(TIMERS_KEY, JSON.stringify([{ id: 1 }, 'x', null]));
		const timers = new Timers();
		timers.load();
		expect(timers.list).toEqual([]);
		localStorage.setItem(TIMERS_KEY, '{broken');
		timers.load();
		expect(timers.list).toEqual([]);
	});

	it('still counts down for the visit when storage is blocked', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		const timers = new Timers();
		timers.load();
		const timer = timers.start(pasta);
		vi.advanceTimersByTime(1000);
		expect(timers.remaining(timer)).toBe(599_000);
		vi.restoreAllMocks();
	});
});
