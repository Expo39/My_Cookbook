/** State the layout shares with pages: the toast, and whether a fixed bar sits at the foot of the page. */
class Chrome {
	toast = $state('');
	hasActionBar = $state(false);
	#timer: ReturnType<typeof setTimeout> | undefined;

	notify(message: string, milliseconds = 2600): void {
		this.toast = message;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.toast = ''), milliseconds);
	}
}

export const chrome = new Chrome();
