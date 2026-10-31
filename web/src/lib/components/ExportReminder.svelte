<script lang="ts">
	import { onMount } from 'svelte';
	import { deviceNotice } from '$lib/stores/device-notice.svelte';
	import { personal } from '$lib/stores/personal.svelte';
	import ExportDialog from './ExportDialog.svelte';
	import Icon from './Icon.svelte';

	/** About once a week, a nudge to export the recipes kept only in this browser; the close cross rests it a week. */
	const own = $derived(personal.list.filter((entry) => !entry.shared));
	let ready = $state(false);
	let dialog: ExportDialog | undefined = $state();

	onMount(() => {
		deviceNotice.load();
		ready = true;
	});
</script>

{#if ready && deviceNotice.due(own.length)}
	<aside class="reminder" aria-label="Export your recipes">
		<Icon name="alert" size={22} />
		<div class="words">
			<p>
				<strong>Your recipes are only in this browser.</strong> If you clear your browsing data, they
				are deleted. Export them to keep a copy.
			</p>
			<button type="button" class="export" onclick={() => dialog?.show()}>
				<Icon name="download" size={18} />Export
			</button>
		</div>
		<button
			type="button"
			class="close"
			aria-label="Remind me next week"
			onclick={() => deviceNotice.rest()}
		>
			<Icon name="x" size={20} />
		</button>
	</aside>
{/if}
<ExportDialog bind:this={dialog} />

<style>
	.reminder {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		border: 1px solid var(--colour-line);
		border-inline-start: 4px solid var(--colour-accent);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	.reminder > :global(svg) {
		flex: none;
		margin-block-start: var(--space-1);
		color: var(--colour-accent);
	}

	.words {
		display: grid;
		max-inline-size: var(--measure);
		flex: 1;
		gap: var(--space-2);
		justify-items: start;
	}

	.export {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 0;
		border-radius: var(--radius-s);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-weight: 700;
	}

	.close {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		margin: calc(-1 * var(--space-2));
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		background: transparent;
		color: var(--colour-muted);
	}

	.close:hover {
		background: var(--colour-tint);
		color: var(--colour-ink);
	}
</style>
