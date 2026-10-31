import { readJson, writeJson } from './storage';

const KEY = 'sapori:device-notice';
const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Recipes added here live only in this browser, and clearing its data deletes them. The cook is
 * told once, when they first add a recipe, and reminded about once a week to export a copy.
 */
class DeviceNotice {
	/** When the first-time notice was read; `null` until then. */
	read = $state<number | null>(null);
	/** When the cook last exported or closed the reminder; the week counts from then. */
	quiet = $state<number | null>(null);

	load(): void {
		const stored = readJson(KEY) as { read?: number; quiet?: number } | undefined;
		this.read = stored?.read ?? null;
		this.quiet = stored?.quiet ?? null;
	}

	/** Whether to remind a cook who has `count` recipes of their own. */
	due(count: number): boolean {
		if (count === 0) return false;
		if (this.quiet === null) {
			this.rest();
			return false;
		}
		return Date.now() - this.quiet >= WEEK;
	}

	acknowledge(): void {
		this.read = Date.now();
		this.rest();
	}

	/** After an export or a closed reminder, the next one is a week away. */
	rest(): void {
		this.quiet = Date.now();
		writeJson(KEY, { read: this.read, quiet: this.quiet });
	}
}

export const deviceNotice = new DeviceNotice();
