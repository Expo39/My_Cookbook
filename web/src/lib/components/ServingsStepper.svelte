<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		label,
		value,
		canDecrease = true,
		onstep
	}: {
		label: string;
		value: string;
		canDecrease?: boolean;
		onstep: (direction: 1 | -1) => void;
	} = $props();
</script>

<div class="stepper" role="group" aria-label={label}>
	<button
		type="button"
		aria-label="Fewer servings"
		disabled={!canDecrease}
		onclick={() => onstep(-1)}
	>
		<Icon name="minus" />
	</button>
	<output class="num" aria-live="polite">{value}</output>
	<button type="button" aria-label="More servings" onclick={() => onstep(1)}>
		<Icon name="plus" />
	</button>
</div>

<style>
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	button {
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		padding: 0;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		transition: background-color var(--duration-micro);
	}

	button:hover:not(:disabled) {
		background: var(--colour-tint);
	}

	/* Greyed only at the limit; a fieldset waiting for the recipe core leaves the look alone. */
	button[disabled] {
		color: var(--colour-muted);
		opacity: 0.55;
	}

	output {
		min-inline-size: 4.5rem;
		font-size: var(--text-l);
		text-align: center;
	}
</style>
