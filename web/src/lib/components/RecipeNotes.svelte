<script lang="ts">
	import { onMount } from 'svelte';
	import type { Notes } from '$lib/stores/notes.svelte';

	let { notes, hydrated }: { notes: Notes; hydrated: boolean } = $props();

	const id = $props.id();

	onMount(() => () => notes.flush());
</script>

<section>
	<label for="{id}-notes">Your notes</label>
	<textarea
		id="{id}-notes"
		rows="3"
		disabled={!hydrated}
		aria-describedby="{id}-help"
		value={notes.text}
		oninput={(event) => notes.set(event.currentTarget.value)}
		onblur={() => notes.flush()}
	></textarea>
	<p id="{id}-help">Notes stay on this device.</p>
</section>

<style>
	section {
		display: grid;
		gap: var(--space-1);
		max-inline-size: var(--measure);
	}

	label {
		color: var(--colour-primary);
		font-weight: 700;
	}

	textarea {
		min-block-size: 5rem;
		padding: var(--space-3);
		border: 1px solid var(--colour-muted);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		resize: vertical;
	}

	textarea:focus-visible {
		border-color: var(--colour-primary);
	}

	p {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	@media print {
		section {
			display: none;
		}
	}
</style>
