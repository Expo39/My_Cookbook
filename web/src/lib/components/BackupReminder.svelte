<script lang="ts">
	import { onMount } from 'svelte';
	import { backup } from '$lib/stores/backup.svelte';
	import { personal } from '$lib/stores/personal.svelte';
	import Icon from './Icon.svelte';

	/** A gentle nudge to keep a copy of the recipes kept only in this browser; the × rests it a while. */
	const own = $derived(personal.list.filter((entry) => !entry.shared));
	let ready = $state(false);

	onMount(() => {
		backup.load();
		ready = true;
	});
</script>

{#if ready && own.length && backup.due(own)}
	<aside class="reminder" aria-label="Back up your recipes">
		<Icon name="download" size={22} />
		<div class="words">
			<p>
				<strong>Keep your recipes safe.</strong>
				{own.length === 1 ? 'Your recipe is' : `Your ${own.length} recipes are`} only in this browser,
				so clearing your browsing data would delete {own.length === 1 ? 'it' : 'them'}. A backup
				file keeps a copy on your device.
			</p>
			<button type="button" class="save" onclick={() => backup.save(own)}>Save a backup</button>
		</div>
		<button
			type="button"
			class="close"
			aria-label="Remind me later"
			onclick={() => backup.dismiss()}
		>
			<Icon name="x" size={20} />
		</button>
	</aside>
{/if}

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
		flex: 1;
		gap: var(--space-2);
		justify-items: start;
	}

	.save {
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
