<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * A one-line pointer to a feature that is easy to miss, until the cook closes it. It is drawn
	 * with the page; `name` lets the script in app.html hide a dismissed one before the first paint.
	 */
	let { name, text, ondismiss }: { name: 'units' | 'steps'; text: string; ondismiss: () => void } =
		$props();
</script>

<p class="hint" data-hint={name}>
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

	/* A hint the cook has closed stays hidden from the first paint (set by the script in app.html). */
	:global([data-hints-off~='units']) .hint[data-hint='units'],
	:global([data-hints-off~='steps']) .hint[data-hint='steps'] {
		display: none;
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
