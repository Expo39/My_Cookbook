<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import IngredientLine from '$lib/components/IngredientLine.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import QuantityEditor from '$lib/components/QuantityEditor.svelte';
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
	import { preferences } from '$lib/stores/preferences.svelte';
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
	const merged = $derived(mergeLines(shopping.recipes, converter, preferences.units));
	/** Each line with the cook's own quantity in place of the recipes', and the recipes' kept beside it. */
	const chosen = (line: ShoppingLine) => {
		const original = quantityText(line);
		const own = shopping.amountOf(line.key);
		const needed = line.max;
		return own
			? { ...line, min: own.qty, max: own.qty, unit: own.unit, original, needed, edited: true }
			: { ...line, original, needed, edited: false };
	};
	const groups = $derived(
		(view === 'type'
			? groupByAisle(merged)
			: groupByRecipe(shopping.recipes, converter, preferences.units)
		).map((group) => ({ ...group, lines: group.lines.map(chosen) }))
	);
	const tickedCount = $derived(merged.filter((line) => shopping.isTicked(line.key)).length);

	onMount(() => {
		preferences.load();
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
		<p class="empty" role="status">Loading your list...</p>
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

		<div class="groups">
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
							<IngredientLine
								id="{id}-{group.id}-{n}"
								text={[line.prefix, line.item].filter(Boolean).join(' ')}
								toTaste={line.toTaste}
								flush
								notes={[
									line.note ?? '',
									line.edited ? `Recipe: ${line.original || 'no amount'}` : '',
									view === 'type' ? sources(line) : ''
								]}
								checked={shopping.isTicked(line.key)}
								ontoggle={() => shopping.toggle(line.key)}
								amount={line.toTaste && !line.edited ? undefined : quantity}
							/>
							{#snippet quantity()}
								<QuantityEditor
									label={line.item}
									shown={quantityText(line)}
									original={line.original}
									edited={line.edited}
									value={line.max}
									unit={line.unit ?? null}
									onset={(qty) =>
										qty === line.needed
											? shopping.resetAmount(line.key)
											: shopping.setAmount(line.key, { qty, unit: line.unit ?? null })}
									onreset={() => shopping.resetAmount(line.key)}
								/>
							{/snippet}
						{/each}
					</ul>
				</section>
			{/each}
		</div>
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
	}

	.groups {
		display: grid;
		gap: var(--space-6);
	}

	/*
	 * On a wide screen each aisle (or recipe) is its own card in a grid, so a quantity sits close to its
	 * name instead of across an empty page.
	 */
	/*
	 * Masonry: columns of cards, each as tall as its list, packed top to bottom. Column layout cannot
	 * use gap between items in a column, so each card keeps a bottom margin instead.
	 */
	@media (min-width: 48rem) {
		.groups {
			display: block;
			columns: 20rem;
			column-gap: var(--space-4);
		}

		section {
			break-inside: avoid;
			margin-block-end: var(--space-4);
			padding: var(--space-4) var(--space-5);
			border: 1px solid var(--colour-line);
			border-radius: var(--radius-m);
			background: var(--colour-surface);
		}
	}

	.empty {
		color: var(--colour-muted);
	}

	.toolbar {
		display: grid;
		gap: var(--space-3);
		max-inline-size: 36rem;
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

	@media print {
		.toolbar,
		.remove {
			display: none;
		}
	}
</style>
