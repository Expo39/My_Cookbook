import type { ScaledStep } from '$lib/types/recipe';

export interface PlanRow {
	number: number;
	heading?: string | null;
	/** Minutes since midnight on the day of serving; negative means an earlier day. */
	at: number;
	/** `null` when the step gives no timing, so it takes no time in the plan. */
	minutes: number | null;
}

export interface Plan {
	startBy: number;
	rows: PlanRow[];
}

/** A step's own time, or else the longest timer written into it. `null` when it says nothing. */
export function stepMinutes(step: ScaledStep): number | null {
	const time = step.time;
	const own = (time?.active ?? 0) + (time?.passive ?? 0);
	if (own > 0) return own;
	const timers = step.segments.flatMap((segment) =>
		segment.type === 'timer' ? [segment.maxMinutes ?? segment.minMinutes] : []
	);
	return timers.length ? timers.reduce((sum, minutes) => sum + minutes, 0) : null;
}

/**
 * The plan is offered only when at least two steps, and at least half of them, give a timing.
 * Below that the schedule would be mostly invented.
 */
export function hasEnoughTiming(steps: ScaledStep[]): boolean {
	const timed = steps.filter((step) => stepMinutes(step) !== null).length;
	return timed >= 2 && timed * 2 >= steps.length;
}

/** Works backwards from `serveAt` (minutes since midnight) to when each step has to start. */
export function planBackwards(steps: ScaledStep[], serveAt: number): Plan {
	let end = serveAt;
	const rows: PlanRow[] = [];
	for (let position = steps.length - 1; position >= 0; position--) {
		const minutes = stepMinutes(steps[position]);
		const at = end - (minutes ?? 0);
		rows.unshift({ number: position + 1, heading: steps[position].heading, at, minutes });
		end = at;
	}
	return { startBy: end, rows };
}

/** "15:40", with "the day before" or "two days before" when the plan reaches back past midnight. */
export function formatClock(minutes: number): { time: string; days: number } {
	const days = Math.ceil(-minutes / 1440 - 1e-9);
	const within = ((Math.round(minutes) % 1440) + 1440) % 1440;
	const time = `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
	return { time, days: Math.max(0, days) };
}

export function clockLabel(minutes: number): string {
	const { time, days } = formatClock(minutes);
	if (days === 0) return time;
	return `${time}, ${days === 1 ? 'the day before' : `${days} days before`}`;
}

/** Parses the value of a time input ("19:30") into minutes since midnight. */
export function parseClock(value: string): number | undefined {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value);
	if (!match) return undefined;
	const [hours, minutes] = [Number(match[1]), Number(match[2])];
	return hours < 24 && minutes < 60 ? hours * 60 + minutes : undefined;
}
