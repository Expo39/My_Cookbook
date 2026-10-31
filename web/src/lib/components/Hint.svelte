<script lang="ts">
	import Icon from './Icon.svelte';

	/** A one-line pointer to a feature that is easy to miss, until the cook closes it. */
	let { text, ondismiss }: { text: string; ondismiss: () => void } = $props();
</script>

<p class="hint">
	<Icon name="info" size={18} />
	<span>{text}</span>
	<button type="button" aria-label="Dismiss the hint" onclick={ondismiss}>
		<Icon name="x" size={18} />
	</button>
</p>

<style>
	.hint {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-inline-start: var(--space-3);
		border: 1px dashed var(--colour-line);
		border-radius: var(--radius-s);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	span {
		flex: 1;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-block-size: var(--target);
		min-inline-size: var(--target);
		border: 0;
		background: transparent;
		color: var(--colour-primary);
	}

	@media print {
		.hint {
			display: none;
		}
	}
</style>
