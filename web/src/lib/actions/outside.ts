import type { Action } from 'svelte/action';

/**
 * Calls `handler` when the pointer goes down anywhere outside the element, so an open editor or a
 * half-confirmed action lets go once the cook moves on.
 */
export const outside: Action<HTMLElement, () => void> = (node, handler) => {
	let current = handler;
	const down = (event: PointerEvent) => {
		if (!node.contains(event.target as Node)) current();
	};
	document.addEventListener('pointerdown', down, true);
	return {
		update: (next) => (current = next),
		destroy: () => document.removeEventListener('pointerdown', down, true)
	};
};
