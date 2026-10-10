/**
 * Keeps the screen on while cook mode is open. The lock is released whenever the page is hidden,
 * so it is asked for again each time the page becomes visible.
 */
export class ScreenAwake {
	#lock: WakeLockSentinel | undefined;
	#active = false;
	readonly #onChange: (available: boolean) => void;

	constructor(onChange: (available: boolean) => void) {
		this.#onChange = onChange;
	}

	start(): void {
		this.#active = true;
		document.addEventListener('visibilitychange', this.#visible);
		void this.#acquire();
	}

	stop(): void {
		this.#active = false;
		document.removeEventListener('visibilitychange', this.#visible);
		void this.#lock?.release().catch(() => undefined);
		this.#lock = undefined;
	}

	#visible = () => {
		if (document.visibilityState === 'visible') void this.#acquire();
	};

	async #acquire(): Promise<void> {
		if (!this.#active || this.#lock) return;
		if (!('wakeLock' in navigator)) return this.#onChange(false);
		try {
			const lock = await navigator.wakeLock.request('screen');
			if (!this.#active) return void lock.release();
			this.#lock = lock;
			lock.addEventListener('release', () => {
				if (this.#lock === lock) this.#lock = undefined;
			});
			this.#onChange(true);
		} catch {
			this.#onChange(false);
		}
	}
}
