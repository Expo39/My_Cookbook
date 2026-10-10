import { readStorage, writeStorage } from './storage';

export const notesKey = (recipeId: string) => `sapori:notes:${recipeId}`;

const SAVE_DELAY = 400;

/** A private note on one recipe, saved on this device a moment after the last keystroke. */
export class Notes {
	text = $state('');
	/** True once the text has been written (or storage turned out to be unavailable). */
	saved = $state(true);
	#timer: ReturnType<typeof setTimeout> | undefined;

	constructor(readonly recipeId: string) {}

	load(): void {
		this.text = readStorage(notesKey(this.recipeId)) ?? '';
		this.saved = true;
	}

	set(text: string): void {
		this.text = text;
		this.saved = false;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.flush(), SAVE_DELAY);
	}

	flush(): void {
		clearTimeout(this.#timer);
		if (this.saved) return;
		writeStorage(notesKey(this.recipeId), this.text.trim() === '' ? null : this.text);
		this.saved = true;
	}
}
