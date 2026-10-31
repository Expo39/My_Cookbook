<script lang="ts" generics="T extends { uid: string }">
	import { tick, type Snippet } from 'svelte';
	import Icon from '../Icon.svelte';
	import '$lib/styles/admin.css';

	let {
		items,
		noun,
		onmove,
		onremove,
		canRemove = true,
		compact = false,
		row
	}: {
		items: T[];
		noun: string;
		onmove: (from: number, to: number) => void;
		onremove: (index: number) => void;
		canRemove?: boolean;
		/** Keeps the buttons beside each item at every width, for long lists of short rows. */
		compact?: boolean;
		row: Snippet<[T, number]>;
	} = $props();

	let dragFrom = $state<number | null>(null);
	let over = $state<number | null>(null);
	let announcement = $state('');

	async function move(from: number, to: number, uid: string, button: 'up' | 'down') {
		if (to < 0 || to >= items.length) return;
		onmove(from, to);
		announcement = `Moved ${noun} ${from + 1} to position ${to + 1} of ${items.length}.`;
		await tick();
		const target = document.getElementById(`${uid}-${button}`) as HTMLButtonElement | null;
		(target && !target.disabled
			? target
			: document.getElementById(`${uid}-${button === 'up' ? 'down' : 'up'}`)
		)?.focus();
	}

	function start(event: DragEvent, index: number) {
		dragFrom = index;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(index));
			const li = (event.currentTarget as HTMLElement).closest('li');
			if (li) event.dataTransfer.setDragImage(li, 16, 16);
		}
	}

	function drop(index: number) {
		if (dragFrom !== null && dragFrom !== index) {
			onmove(dragFrom, index);
			announcement = `Moved ${noun} ${dragFrom + 1} to position ${index + 1} of ${items.length}.`;
		}
		dragFrom = null;
		over = null;
	}
</script>

<ul class:compact>
	{#each items as item, index (item.uid)}
		<!-- A drop target for the pointer; the buttons below do the same job from the keyboard. -->
		<li
			class:over={over === index && dragFrom !== null && dragFrom !== index}
			ondragover={(event) => {
				if (dragFrom === null) return;
				event.preventDefault();
				over = index;
			}}
			ondrop={(event) => {
				event.preventDefault();
				drop(index);
			}}
		>
			<span
				class="handle"
				draggable="true"
				aria-hidden="true"
				ondragstart={(event) => start(event, index)}
				ondragend={() => {
					dragFrom = null;
					over = null;
				}}
			>
				<Icon name="grip" />
			</span>
			<div class="body">{@render row(item, index)}</div>
			<div class="actions">
				<button
					type="button"
					class="icon-btn"
					id="{item.uid}-up"
					disabled={index === 0}
					aria-label="Move {noun} {index + 1} up"
					onclick={() => move(index, index - 1, item.uid, 'up')}
				>
					<Icon name="arrowUp" />
				</button>
				<button
					type="button"
					class="icon-btn"
					id="{item.uid}-down"
					disabled={index === items.length - 1}
					aria-label="Move {noun} {index + 1} down"
					onclick={() => move(index, index + 1, item.uid, 'down')}
				>
					<Icon name="arrowDown" />
				</button>
				<button
					type="button"
					class="icon-btn remove"
					disabled={!canRemove}
					aria-label="Remove {noun} {index + 1}"
					onclick={() => onremove(index)}
				>
					<Icon name="trash" />
				</button>
			</div>
		</li>
	{/each}
</ul>
<p class="sr-only" role="status">{announcement}</p>

<style>
	ul {
		display: grid;
		gap: var(--space-3);
	}

	li {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-areas:
			'handle body'
			'. actions';
		gap: var(--space-2) var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-bg);
	}

	li.over {
		border-color: var(--colour-primary);
		background: var(--colour-tint);
	}

	.handle {
		grid-area: handle;
		display: grid;
		place-items: center;
		inline-size: 1.5rem;
		color: var(--colour-muted);
		cursor: grab;
	}

	.body {
		grid-area: body;
		min-inline-size: 0;
	}

	.actions {
		grid-area: actions;
		display: flex;
		gap: var(--space-2);
	}

	.remove {
		color: var(--colour-danger);
	}

	.compact li {
		padding: var(--space-2);
	}

	.compact li,
	.compact .actions {
		gap: 0 var(--space-1);
	}

	@media (min-width: 64rem) {
		li {
			grid-template-columns: auto 1fr auto;
			grid-template-areas: 'handle body actions';
		}

		.actions {
			flex-direction: column;
			gap: 0;
		}
	}

	.compact li {
		grid-template-columns: auto 1fr auto;
		grid-template-areas: 'handle body actions';
	}

	.compact .actions {
		flex-direction: column;
	}
</style>
