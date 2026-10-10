<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';

	let { compact = false }: { compact?: boolean } = $props();

	const id = $props.id();
</script>

<form class:compact action={resolve('/search')} method="get" role="search">
	<label for={id} class:sr-only={compact}>Search recipes</label>
	<div class="field">
		<Icon name="search" />
		<input
			{id}
			type="search"
			name="q"
			autocomplete="off"
			placeholder={compact ? 'Search' : 'Try brulee, lamb or tomato'}
		/>
		<button type="submit" aria-label={compact ? 'Search' : undefined}>
			{#if compact}<Icon name="chevronRight" />{:else}Search{/if}
		</button>
	</div>
</form>

<style>
	form {
		display: grid;
		gap: var(--space-2);
	}

	label {
		font-weight: 700;
	}

	.field {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-inline-start: var(--space-3);
		border: 1px solid var(--colour-muted);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-muted);
	}

	.field:focus-within {
		border-color: var(--colour-primary);
		outline: 2px solid var(--colour-primary);
		outline-offset: 2px;
	}

	input {
		flex: 1;
		min-inline-size: 0;
		min-block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-ink);
		font-size: var(--text-l);
	}

	input:focus-visible {
		outline: none;
	}

	input::placeholder {
		color: var(--colour-muted);
	}

	button {
		display: grid;
		place-items: center;
		min-inline-size: var(--target);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 0;
		border-radius: 0 var(--radius-s) var(--radius-s) 0;
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-weight: 700;
	}

	.compact .field {
		padding-inline-start: var(--space-2);
	}

	.compact input {
		inline-size: 9rem;
		font-size: var(--text-m);
	}

	.compact button {
		padding-inline: 0;
	}
</style>
