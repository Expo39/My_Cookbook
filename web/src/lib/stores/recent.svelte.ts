import { readList, writeList } from './storage';

export const RECENT_KEY = 'sapori:recent';
export const RECENT_LIMIT = 8;

/** The recipes opened most recently, newest first. */
class Recent {
	ids = $state<string[]>([]);

	load(): void {
		this.ids = readList(RECENT_KEY).slice(0, RECENT_LIMIT);
	}

	add(id: string): void {
		this.ids = [id, ...readList(RECENT_KEY).filter((existing) => existing !== id)].slice(
			0,
			RECENT_LIMIT
		);
		writeList(RECENT_KEY, this.ids);
	}
}

export const recent = new Recent();
