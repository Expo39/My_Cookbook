import { toExport } from '$lib/data/local-export';
import type { LocalRecipe } from '$lib/data/local-store';
import { download } from '$lib/share';
import { readJson, writeJson } from './storage';

const KEY = 'sapori:backup';
/** A closed reminder stays away this long, and returns only if recipes are still not backed up. */
const QUIET_MILLISECONDS = 14 * 24 * 60 * 60 * 1000;

/**
 * Recipes added here live in the browser, and clearing its data deletes them; no site storage
 * survives that. A backup file on the device does, so the cook is reminded to save one.
 */
class Backup {
	saved = $state<number | null>(null);
	dismissed = $state<number | null>(null);

	load(): void {
		const stored = readJson(KEY) as { saved?: number; dismissed?: number } | undefined;
		this.saved = stored?.saved ?? null;
		this.dismissed = stored?.dismissed ?? null;
	}

	/** Whether any of `entries` changed since the last backup, and the reminder is not resting. */
	due(entries: LocalRecipe[]): boolean {
		const changed = entries.some((entry) => entry.updated > (this.saved ?? 0));
		const resting = this.dismissed !== null && Date.now() - this.dismissed < QUIET_MILLISECONDS;
		return changed && !resting;
	}

	save(entries: LocalRecipe[]): void {
		const blob = new Blob([toExport(entries)], { type: 'application/json' });
		download(blob, `my-recipes-${new Date().toISOString().slice(0, 10)}.json`);
		this.saved = Date.now();
		this.#write();
	}

	dismiss(): void {
		this.dismissed = Date.now();
		this.#write();
	}

	#write(): void {
		writeJson(KEY, { saved: this.saved, dismissed: this.dismissed });
	}
}

export const backup = new Backup();
