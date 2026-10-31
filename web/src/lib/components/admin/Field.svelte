<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../Icon.svelte';
	import InfoTip from '../InfoTip.svelte';

	let {
		id,
		label,
		hint,
		info,
		error,
		optional = false,
		children
	}: {
		id: string;
		label: string;
		hint?: string;
		/** A longer explanation behind an "i" beside the label. */
		info?: string;
		error?: string;
		optional?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="field">
	<div class="head">
		<label for={id}
			>{label}{#if optional}<span class="opt">optional</span>{/if}</label
		>
		{#if info}<InfoTip topic={label.toLowerCase()} text={info} />{/if}
	</div>
	{@render children()}
	{#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
	{#if error}
		<p class="error" id="{id}-error" role="alert"><Icon name="alert" size={16} />{error}</p>
	{/if}
</div>

<style>
	.field {
		display: grid;
		gap: var(--space-1);
		align-content: start;
		min-inline-size: 0;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	label {
		font-weight: 700;
	}

	.opt {
		margin-inline-start: var(--space-2);
		color: var(--colour-muted);
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.hint {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.error {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		color: var(--colour-danger);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.error :global(svg) {
		flex: none;
		margin-block-start: 0.15em;
	}
</style>
