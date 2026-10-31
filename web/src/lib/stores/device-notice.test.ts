import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceNotice } from './device-notice.svelte';

const DAY = 24 * 60 * 60 * 1000;

describe('the note that recipes live only in this browser', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
		deviceNotice.load();
	});
	afterEach(() => vi.useRealTimers());

	it('is not shown to a cook with no recipes of their own', () => {
		expect(deviceNotice.due(0)).toBe(false);
	});

	it('waits a week after the first recipe before reminding', () => {
		expect(deviceNotice.due(1)).toBe(false);
		vi.setSystemTime(Date.now() + 6 * DAY);
		expect(deviceNotice.due(1)).toBe(false);
		vi.setSystemTime(Date.now() + 1 * DAY);
		expect(deviceNotice.due(1)).toBe(true);
	});

	it('rests another week after an export or a close, and remembers it across visits', () => {
		deviceNotice.acknowledge();
		vi.setSystemTime(Date.now() + 8 * DAY);
		expect(deviceNotice.due(2)).toBe(true);
		deviceNotice.rest();
		deviceNotice.load();
		expect(deviceNotice.read).not.toBeNull();
		expect(deviceNotice.due(2)).toBe(false);
	});

	it('clears the setting the old backup reminder left behind', () => {
		localStorage.setItem('sapori:backup', '{"saved":1}');
		deviceNotice.load();
		expect(localStorage.getItem('sapori:backup')).toBeNull();
	});
});
