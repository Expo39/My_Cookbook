/** State the layout shares with pages: the toast, and whether a fixed bar sits at the foot of the page. */
/** A button on the toast, such as "Undo". */
export interface ToastAction {
	label: string;
	run: () => void;
}

class Chrome {
	toast = $state('');
	action = $state<ToastAction | null>(null);
	hasActionBar = $state(false);
	/** Cook mode has its own timer strip, so the page's one steps aside while it is open. */
	cooking = $state(false);
	#timer: ReturnType<typeof setTimeout> | undefined;

	notify(message: string, milliseconds = 2600, action: ToastAction | null = null): void {
		this.toast = message;
		this.action = action;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.dismiss(), milliseconds);
	}

	dismiss(): void {
		clearTimeout(this.#timer);
		this.toast = '';
		this.action = null;
	}
}

export const chrome = new Chrome();
