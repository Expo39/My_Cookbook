<script lang="ts">
	import { chrome } from '$lib/stores/chrome.svelte';
	import Icon from './Icon.svelte';

	let visible = $state(false);

	function toTop() {
		const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
		scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
	}
</script>

<svelte:window onscroll={() => (visible = scrollY > 400)} />

<button
	type="button"
	class:visible
	class:lifted={chrome.hasActionBar}
	aria-label="Back to top"
	tabindex={visible ? 0 : -1}
	onclick={toTop}
>
	<Icon name="arrowUp" />
</button>

<style>
	button {
		position: fixed;
		inset-block-end: max(var(--space-4), env(safe-area-inset-bottom, 0px));
		inset-inline-end: max(var(--space-4), env(safe-area-inset-right, 0px));
		z-index: 5;
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		padding: 0;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		opacity: 0;
		visibility: hidden;
		transform: translateY(var(--space-2));
		transition:
			opacity var(--duration-micro),
			transform var(--duration-micro),
			visibility var(--duration-micro);
	}

	.visible {
		opacity: 0.85;
		visibility: visible;
		transform: none;
	}

	.visible:hover,
	.visible:focus-visible {
		opacity: 1;
	}

	@media (max-width: 47.99rem) {
		.lifted {
			inset-block-end: calc(var(--bar-height) + env(safe-area-inset-bottom, 0px) + var(--space-3));
		}
	}

	@media print {
		button {
			display: none;
		}
	}
</style>
