<script lang="ts">
	import type { Snippet } from 'svelte';

	let { legend, id, children }: { legend: string; id?: string; children: Snippet } = $props();
</script>

<fieldset {id}>
	<legend>{legend}</legend>
	{@render children()}
</fieldset>

<style>
	fieldset {
		display: grid;
		gap: var(--space-4);
		min-inline-size: 0;
		margin: 0;
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	legend {
		padding-inline: var(--space-2);
		color: var(--colour-primary);
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 800;
	}
</style>
