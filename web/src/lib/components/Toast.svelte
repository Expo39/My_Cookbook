<script lang="ts">
	import { chrome } from '$lib/stores/chrome.svelte';
</script>

<div class="toast" class:shown={chrome.toast !== ''} role="status">
	<span>{chrome.toast}</span>
	{#if chrome.action}
		{@const action = chrome.action}
		<button
			type="button"
			onclick={() => {
				action.run();
				chrome.dismiss();
			}}>{action.label}</button
		>
	{/if}
</div>

<style>
	.toast {
		position: fixed;
		inset-inline: var(--gutter);
		inset-block-end: calc(var(--bar-height) + env(safe-area-inset-bottom, 0px) + var(--space-5));
		z-index: 30;
		inline-size: fit-content;
		max-inline-size: calc(100vw - 2 * var(--space-4));
		margin-inline: auto;
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		box-shadow: var(--shadow-float);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--duration-micro),
			visibility var(--duration-micro);
	}

	.shown {
		opacity: 1;
		visibility: visible;
	}

	@media (min-width: 48rem) {
		.toast {
			inset-block-end: var(--space-5);
		}
	}

	@media print {
		.toast {
			display: none;
		}
	}

	button {
		min-block-size: var(--target);
		margin-block: calc(-1 * var(--space-2));
		padding-inline: var(--space-3);
		border: 0;
		border-radius: var(--radius-s);
		background: transparent;
		color: var(--colour-primary);
		font-weight: 700;
	}

	button:hover {
		background: var(--colour-tint);
	}
</style>
