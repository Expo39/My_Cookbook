<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { convert, loadCore } from '$lib/core';
	import { shareText } from '$lib/kitchen/share-text';
	import {
		groupByAisle,
		groupByRecipe,
		listText,
		mergeLines,
		quantityText,
		type ShoppingLine
	} from '$lib/kitchen/shopping';
	import { homeHref } from '$lib/links';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { shopping } from '$lib/stores/shopping.svelte';

	type View = 'type' | 'recipe';

	const id = $props.id();

	let view = $state<View>('type');
	let coreReady = $state(false);
	/** Nothing is shown until the list is read and the converter is ready, so lines do not merge late. */
	let ready = $state(false);
	let confirming = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;

	const converter = $derived(coreReady ? convert : undefined);
	const merged = $derived(mergeLines(shopping.recipes, converter));
	const groups = $derived(
		view === 'type' ? groupByAisle(merged) : groupByRecipe(shopping.recipes, converter)
	);
	const tickedCount = $derived(merged.filter((line) => shopping.isTicked(line.key)).length);

	onMount(() => {
		shopping.load();
		loadCore()
			.then(() => (coreReady = true))
			.catch(() => undefined)
			.finally(() => (ready = true));
		return () => clearTimeout(confirmTimer);
	});

	async function share() {
		const text = listText(groups, new Set(shopping.ticked));
		const outcome = await shareText('Shopping list', text);
		if (outcome === 'copied') chrome.notify('List copied');
		if (outcome === 'failed')
			chrome.notify('Could not share. Select the list and copy it instead.', 5000);
	}

	function clearAll() {
		if (!confirming) {
			confirming = true;
			confirmTimer = setTimeout(() => (confirming = false), 4000);
			return;
		}
		clearTimeout(confirmTimer);
		confirming = false;
		shopping.clearAll();
	}

	const sources = (line: ShoppingLine) => line.recipes.map((recipe) => recipe.title).join(', ');
</script>

<PageHead
	title="Shopping list"
	description="Ingredients from the recipes you plan to cook, merged into one list."
	path="shopping-list"
/>

<div class="page">
	<h1>Shopping list</h1>

	{#if !ready}
		<p class="empty" role="status">Loading your list…</p>
	{:else if merged.length === 0}
		<p class="empty">Your list is empty. Add ingredients from any recipe.</p>
		<p><a href={homeHref()}>Find a recipe</a></p>
	{:else}
		<div class="toolbar">
			<Segmented
				legend="Group by"
				name="{id}-view"
				options={[
					{ value: 'type', label: 'Type' },
					{ value: 'recipe', label: 'Recipe' }
				]}
				value={view}
				onchange={(value) => (view = value as View)}
			/>
			<p class="progress">
				<span class="num" aria-live="polite">{tickedCount} of {merged.length}</span> ticked
			</p>
			<div class="actions">
				<button type="button" onclick={share}><Icon name="share" />Share list</button>
				<button type="button" disabled={tickedCount === 0} onclick={() => shopping.clearTicked()}>
					<Icon name="check" />Clear ticked
				</button>
				<button type="button" class:danger={confirming} onclick={clearAll}>
					<Icon name="trash" />{confirming ? 'Tap again to clear all' : 'Clear all'}
				</button>
			</div>
		</div>

		{#each groups as group (group.id)}
			<section aria-labelledby="{id}-{group.id}">
				<div class="head">
					<h2 id="{id}-{group.id}" class="label">{group.label}</h2>
					{#if view === 'recipe'}
						<button
							type="button"
							class="remove"
							aria-label="Remove {group.label} from the list"
							onclick={() => shopping.remove(group.id)}
						>
							<Icon name="x" size={18} />
						</button>
					{/if}
				</div>
				<ul>
					{#each group.lines as line, n (line.key + n)}
						{@const ticked = shopping.isTicked(line.key)}
						{@const quantity = quantityText(line)}
						<li class:ticked>
							<input
								id="{id}-{group.id}-{n}"
								type="checkbox"
								checked={ticked}
								onchange={() => shopping.toggle(line.key)}
							/>
							{#if quantity}<span class="amount num">{quantity}</span>{/if}
							<label for="{id}-{group.id}-{n}" class:wide={!quantity}>
								{line.prefix ? `${line.prefix} ` : ''}{line.item}
								{#if line.note}<span class="note">{line.note}</span>{/if}
								{#if view === 'type'}<span class="note">{sources(line)}</span>{/if}
							</label>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>

<style>
	.page,
	section {
		display: grid;
		gap: var(--space-4);
	}

	.page {
		gap: var(--space-5);
		max-inline-size: 48rem;
	}

	.empty {
		color: var(--colour-muted);
	}

	.toolbar {
		display: grid;
		gap: var(--space-3);
	}

	.progress {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.actions button,
	.remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		min-inline-size: var(--target);
		padding-inline: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		font-weight: 700;
	}

	.actions button:hover:not(:disabled),
	.remove:hover {
		background: var(--colour-tint);
	}

	.actions button:disabled {
		opacity: 0.6;
	}

	.actions .danger {
		border-color: var(--colour-danger);
		color: var(--colour-danger);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	h2 {
		font-family: var(--font-body);
		letter-spacing: 0.08em;
	}

	.remove {
		padding: 0;
		border: 0;
		background: transparent;
	}

	li {
		display: grid;
		grid-template-columns: var(--target) 5.5rem 1fr;
		align-items: start;
		border-block-end: 1px dashed var(--colour-line);
	}

	input {
		appearance: none;
		position: relative;
		inline-size: var(--target);
		block-size: var(--target);
		margin: 0;
	}

	input::before {
		content: '';
		position: absolute;
		inset: 50% auto auto 50%;
		inline-size: 1.25rem;
		block-size: 1.25rem;
		border: 2px solid var(--colour-muted);
		border-radius: var(--radius-s);
		transform: translate(-50%, -50%);
		transition:
			background-color var(--duration-micro),
			border-color var(--duration-micro);
	}

	input::after {
		content: '';
		position: absolute;
		inset: 50% auto auto 50%;
		inline-size: 0.35rem;
		block-size: 0.65rem;
		border: solid var(--colour-on-primary);
		border-width: 0 2px 2px 0;
		opacity: 0;
		transform: translate(-50%, -62%) rotate(45deg);
	}

	input:checked::before {
		border-color: var(--colour-primary);
		background: var(--colour-primary);
	}

	input:checked::after {
		opacity: 1;
	}

	.amount {
		padding-inline-end: var(--space-2);
		line-height: var(--target);
		text-align: end;
	}

	label {
		display: grid;
		gap: var(--space-1);
		padding-block: calc((var(--target) - 1.6em) / 2);
		cursor: pointer;
	}

	.wide {
		grid-column: 2 / -1;
	}

	.note {
		color: var(--colour-muted);
		font-size: var(--text-s);
		font-style: italic;
	}

	.ticked .amount,
	.ticked label {
		color: var(--colour-muted);
		text-decoration: line-through;
		opacity: 0.7;
		transition: opacity var(--duration-micro);
	}

	@media print {
		.toolbar,
		.remove,
		input {
			display: none;
		}

		li {
			grid-template-columns: 5rem 1fr;
		}
	}
</style>
