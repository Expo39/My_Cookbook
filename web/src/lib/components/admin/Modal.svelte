<script lang="ts">
	import '$lib/styles/admin.css';
	import type { Snippet } from 'svelte';
	import Icon from '../Icon.svelte';

	let { title, onclose, children }: { title: string; onclose?: () => void; children: Snippet } =
		$props();

	const id = $props.id();
	let dialog: HTMLDialogElement;

	export function show() {
		dialog.showModal();
	}

	export function close() {
		dialog.close();
	}
</script>

<dialog bind:this={dialog} aria-labelledby="{id}-title" {onclose}>
	<div class="panel">
		<div class="head">
			<h2 id="{id}-title">{title}</h2>
			<button type="button" class="icon-btn" aria-label="Close" onclick={() => dialog.close()}>
				<Icon name="x" />
			</button>
		</div>
		{@render children()}
	</div>
</dialog>

<style>
	dialog {
		inline-size: min(36rem, calc(100vw - 2 * var(--space-4)));
		max-block-size: calc(100dvh - 2 * var(--space-4));
		padding: 0;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		color: var(--colour-ink);
		box-shadow: var(--shadow-float);
	}

	dialog::backdrop {
		background: var(--colour-scrim);
	}

	.panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-5);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
</style>
