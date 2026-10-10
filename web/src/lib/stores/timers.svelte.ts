import { alertFinished } from '$lib/kitchen/alert';
import {
	MINUTE,
	isTimerState,
	remainingMs,
	statusOf,
	type TimerState,
	type TimerStatus
} from '$lib/kitchen/timer-math';
import { readJson, writeJson } from './storage';

export const TIMERS_KEY = 'sapori:timers';
const TICK_MS = 250;

interface NewTimer {
	id: string;
	name: string;
	minutes: number;
}

/**
 * Every timer is kept as the moment it ends, so a reload or a locked screen cannot make it drift.
 * Pausing stores what was left instead.
 */
export class Timers {
	list = $state<TimerState[]>([]);
	now = $state(0);
	/** Read out by the strip's live region when a timer finishes. */
	announcement = $state('');
	readonly #clock: () => number;
	readonly #notify: (timer: TimerState) => void;
	#interval: ReturnType<typeof setInterval> | undefined;
	#listening = false;

	constructor(
		clock: () => number = () => Date.now(),
		notify: (timer: TimerState) => void = () => alertFinished()
	) {
		this.#clock = clock;
		this.#notify = notify;
		this.now = clock();
	}

	load(): void {
		const stored = readJson(TIMERS_KEY);
		this.list = Array.isArray(stored) ? stored.filter(isTimerState) : [];
		if (!this.#listening && typeof document !== 'undefined') {
			this.#listening = true;
			document.addEventListener('visibilitychange', () => this.tick());
		}
		this.tick();
	}

	get(id: string): TimerState | undefined {
		return this.list.find((timer) => timer.id === id);
	}

	status(timer: TimerState): TimerStatus {
		return statusOf(timer, this.now);
	}

	remaining(timer: TimerState): number {
		return remainingMs(timer, this.now);
	}

	/** Starts a timer, or returns the one already there so a second tap never restarts it. */
	start({ id, name, minutes }: NewTimer): TimerState {
		const existing = this.get(id);
		if (existing) return existing;
		const durationMs = Math.round(minutes * MINUTE);
		this.now = this.#clock();
		this.list.push({
			id,
			name,
			durationMs,
			endAt: this.now + durationMs,
			leftMs: durationMs,
			alerted: false
		});
		this.#commit();
		return this.list[this.list.length - 1];
	}

	pause(id: string): void {
		const timer = this.get(id);
		if (!timer || this.status(timer) !== 'running') return;
		timer.leftMs = remainingMs(timer, this.#clock());
		timer.endAt = null;
		this.#commit();
	}

	resume(id: string): void {
		const timer = this.get(id);
		if (!timer || timer.endAt !== null) return;
		timer.endAt = this.#clock() + timer.leftMs;
		this.#commit();
	}

	addMinute(id: string): void {
		const timer = this.get(id);
		if (!timer) return;
		const now = this.#clock();
		timer.durationMs += MINUTE;
		if (timer.endAt === null) timer.leftMs += MINUTE;
		else if (timer.endAt <= now) {
			timer.endAt = now + MINUTE;
			timer.alerted = false;
		} else timer.endAt += MINUTE;
		this.#commit();
	}

	dismiss(id: string): void {
		this.list = this.list.filter((timer) => timer.id !== id);
		this.#commit();
	}

	/** Brings the clock up to date and raises the alert for any timer that has just finished. */
	tick(): void {
		this.now = this.#clock();
		let changed = false;
		for (const timer of this.list) {
			if (timer.alerted || this.status(timer) !== 'finished') continue;
			timer.alerted = true;
			changed = true;
			const message = `${timer.name} timer finished.`;
			this.announcement = message;
			setTimeout(() => this.announcement === message && (this.announcement = ''), 8000);
			this.#notify(timer);
		}
		if (changed) writeJson(TIMERS_KEY, this.list);
		this.#sync();
	}

	#commit(): void {
		writeJson(TIMERS_KEY, this.list);
		this.tick();
	}

	/** The clock only ticks while something is counting down. */
	#sync(): void {
		const running = this.list.some((timer) => this.status(timer) === 'running');
		if (running && this.#interval === undefined) {
			this.#interval = setInterval(() => this.tick(), TICK_MS);
		} else if (!running && this.#interval !== undefined) {
			clearInterval(this.#interval);
			this.#interval = undefined;
		}
	}
}

export const timers = new Timers();
