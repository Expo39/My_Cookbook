let context: AudioContext | undefined;

/** Browsers only let audio start after a tap, so the first timer a cook starts prepares it. */
export function unlockAudio(): void {
	try {
		const Context =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Context) return;
		context ??= new Context();
		void context.resume();
	} catch {
		/* no sound, but the pulse and the announcement still happen */
	}
}

function beep(): void {
	if (!context) return;
	const start = context.currentTime;
	for (let n = 0; n < 3; n++) {
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		const at = start + n * 0.28;
		oscillator.frequency.value = 880;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
		oscillator.connect(gain).connect(context.destination);
		oscillator.start(at);
		oscillator.stop(at + 0.22);
	}
}

export function alertFinished(): void {
	try {
		beep();
	} catch {
		/* the pulse and the announcement still happen */
	}
	try {
		navigator.vibrate?.([300, 150, 300, 150, 300]);
	} catch {
		/* vibration is optional */
	}
}
