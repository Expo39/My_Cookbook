export interface TimerState {
	id: string;
	name: string;
	durationMs: number;
	/** When a running or finished timer ends. `null` while it is paused. */
	endAt: number | null;
	/** What was left when it was paused. */
	leftMs: number;
	alerted: boolean;
}

export type TimerStatus = 'running' | 'paused' | 'finished';

export const MINUTE = 60_000;

export function statusOf(timer: TimerState, now: number): TimerStatus {
	if (timer.endAt === null) return 'paused';
	return timer.endAt <= now ? 'finished' : 'running';
}

export function remainingMs(timer: TimerState, now: number): number {
	return timer.endAt === null ? timer.leftMs : Math.max(0, timer.endAt - now);
}

/** "4:05", or "1:02:03" from an hour up. Rounds up so a timer never shows 0:00 while it still runs. */
export function clockText(ms: number): string {
	const total = Math.ceil(Math.max(0, ms) / 1000);
	const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
	const pad = (n: number) => String(n).padStart(2, '0');
	return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function isTimerState(value: unknown): value is TimerState {
	if (typeof value !== 'object' || value === null) return false;
	const timer = value as Record<string, unknown>;
	return (
		typeof timer.id === 'string' &&
		typeof timer.name === 'string' &&
		typeof timer.durationMs === 'number' &&
		(timer.endAt === null || typeof timer.endAt === 'number') &&
		typeof timer.leftMs === 'number' &&
		typeof timer.alerted === 'boolean'
	);
}
