import { describe, expect, it } from 'vitest';
import type { ScaledStep } from '$lib/types/recipe';
import {
	clockLabel,
	formatClock,
	hasEnoughTiming,
	parseClock,
	planBackwards,
	stepMinutes
} from './planner';

const timer = (min: number, max?: number) => ({
	type: 'timer' as const,
	text: `${min} min`,
	minMinutes: min,
	maxMinutes: max ?? null
});
const step = (extra: Partial<ScaledStep> = {}): ScaledStep => ({
	text: 'Do something.',
	segments: [{ type: 'text', text: 'Do something.' }],
	...extra
});

describe('step durations', () => {
	it('prefers the step time, active plus passive', () => {
		expect(stepMinutes(step({ time: { active: 10, passive: 20 }, segments: [timer(5)] }))).toBe(30);
	});

	it('falls back to the timers in the step, using the longer end of a range', () => {
		expect(stepMinutes(step({ segments: [timer(12, 15), timer(5)] }))).toBe(20);
	});

	it('is null when a step says nothing', () => {
		expect(stepMinutes(step())).toBeNull();
	});
});

describe('when the planner is offered', () => {
	it('needs at least two timed steps, and at least half of all steps', () => {
		const timed = step({ time: { passive: 10 } });
		expect(hasEnoughTiming([timed, step(), step()])).toBe(false);
		expect(hasEnoughTiming([timed, timed, step(), step()])).toBe(true);
		expect(hasEnoughTiming([timed, timed, step(), step(), step()])).toBe(false);
		expect(hasEnoughTiming([])).toBe(false);
	});
});

describe('working backwards from the serving time', () => {
	const steps = [
		step({ time: { active: 15 } }),
		step({ heading: 'Bake', time: { passive: 60 } }),
		step(),
		step({ segments: [timer(10)] })
	];

	it('puts each step before the one after it', () => {
		const serveAt = 19 * 60 + 30;
		const plan = planBackwards(steps, serveAt);
		expect(plan.rows.map((row) => row.at)).toEqual([
			serveAt - 10 - 60 - 15,
			serveAt - 10 - 60,
			serveAt - 10,
			serveAt - 10
		]);
		expect(plan.startBy).toBe(plan.rows[0].at);
		expect(clockLabel(plan.startBy)).toBe('18:05');
		expect(plan.rows[1].heading).toBe('Bake');
	});

	it('gives an untimed step no duration of its own', () => {
		const plan = planBackwards(steps, 1200);
		expect(plan.rows[2].minutes).toBeNull();
		expect(plan.rows[2].at).toBe(1200 - 10);
	});

	it('reaches back across midnight and says so', () => {
		const long = [step({ time: { passive: 12 * 60 } }), step({ time: { passive: 120 } })];
		const plan = planBackwards(long, 19 * 60);
		expect(plan.startBy).toBe(19 * 60 - 14 * 60);
		const overnight = planBackwards([step({ time: { passive: 20 * 60 } })], 8 * 60);
		expect(clockLabel(overnight.startBy)).toBe('12:00, the day before');
	});
});

describe('clock text', () => {
	it('formats minutes since midnight and counts days back', () => {
		expect(formatClock(0)).toEqual({ time: '00:00', days: 0 });
		expect(formatClock(-60)).toEqual({ time: '23:00', days: 1 });
		expect(formatClock(-1441)).toEqual({ time: '23:59', days: 2 });
		expect(clockLabel(-1441)).toBe('23:59, 2 days before');
	});

	it('parses a time input and rejects nonsense', () => {
		expect(parseClock('15:40')).toBe(940);
		expect(parseClock('')).toBeUndefined();
		expect(parseClock('24:00')).toBeUndefined();
		expect(parseClock('7:61')).toBeUndefined();
	});
});
