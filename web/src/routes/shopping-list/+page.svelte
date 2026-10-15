<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { outside } from '$lib/actions/outside';
	import Icon from '$lib/components/Icon.svelte';
	import IngredientLine from '$lib/components/IngredientLine.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import QuantityEditor from '$lib/components/QuantityEditor.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { convert, loadCore, type Unit } from '$lib/core';
	import { shareText } from '$lib/kitchen/share-text';
	import {
		groupByAisle,
		groupByRecipe,
		listText,
		mergeLines,
		lineKey as lineKeyOf,
		quantityText,
		type ShoppingLine
	} from '$lib/kitchen/shopping';
	import { unitLabel } from '$lib/recipe/format';
	import { homeHref } from '$lib/links';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { OWN_ITEMS, shopping } from '$lib/stores/shopping.svelte';

	type View = 'type' | 'recipe';

	const id = $props.id();

	let view = $state<View>('type');
	let coreReady = $state(false);
	/** Nothing is shown until the list is read and the converter is ready, so lines do not merge late. */
	let ready = $state(false);
	let confirming = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;

	const converter = $derived(coreReady ? convert : undefined);
	const merged = $derived(
		mergeLines(shopping.recipes, converter, preferences.units).filter(
			(line) => !shopping.isHidden(line.key)
		)
	);
	/** Only typed in by hand, so it has no aisle the recipes would give it. */
	const ownOnly = (line: ShoppingLine) =>
		line.recipes.length > 0 && line.recipes.every((recipe) => recipe.id === OWN_ITEMS);
	/** Each line with the cook's own quantity in place of the recipes', and the recipes' kept beside it. */
	const chosen = (line: ShoppingLine) => {
		const original = quantityText(line);
		const own = ownOnly(line) ? undefined : shopping.amountOf(line.key);
		const needed = line.max;
		return own
			? { ...line, min: own.qty, max: own.qty, unit: own.unit, original, needed, edited: true }
			: { ...line, original, needed, edited: false };
	};
	const groups = $derived(
		(view === 'type'
			? [
					{ id: OWN_ITEMS, label: 'Added by you', lines: merged.filter(ownOnly) },
					...groupByAisle(merged.filter((line) => !ownOnly(line)))
				]
			: groupByRecipe(shopping.recipes, converter, preferences.units).map((group) => ({
					...group,
					lines: group.lines.filter((line) => !shopping.isHidden(line.key))
				}))
		)
			.filter((group) => group.lines.length > 0)
			.map((group) => ({ ...group, lines: group.lines.map(chosen) }))
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

	let own = $state('');
	let ownQty = $state('');
	let ownUnit = $state<Unit | ''>('');
	let ownNote = $state('');
	let noting = $state(false);
	let adding = $state(false);
	let itemField: HTMLInputElement | undefined = $state();

	async function startAdding() {
		adding = true;
		await tick();
		itemField?.focus();
	}

	/** The units of the chosen system; spoons belong to both. */
	const units = $derived<Unit[]>(
		preferences.units === 'us'
			? ['oz', 'lb', 'cup', 'floz', 'tbsp', 'tsp']
			: ['g', 'kg', 'ml', 'l', 'tbsp', 'tsp']
	);

	function addOwn(event: SubmitEvent) {
		event.preventDefault();
		const name = own.trim();
		if (!name) return;
		const qty = Number(ownQty.replace(',', '.'));
		const note = ownNote.trim();
		shopping.addOwn({
			item: name,
			...(note ? { note } : {}),
			...(ownQty.trim() && Number.isFinite(qty) && qty > 0
				? { min: qty, max: qty, unit: ownUnit || null }
				: {})
		});
		own = '';
		ownQty = '';
		ownNote = '';
		noting = false;
		itemField?.focus();
	}

	/** Off the list at once, with a moment to take it back. */
	function removeLine(line: ShoppingLine) {
		const typed = ownOnly(line)
			? shopping.recipes
					.find((recipe) => recipe.id === OWN_ITEMS)
					?.items.find((item) => lineKeyOf(item) === line.key)
			: undefined;
		shopping.hide(line.key);
		chrome.notify(`Removed ${line.item}`, 5000, {
			label: 'Undo',
			run: () => shopping.unhide(line.key, typed)
		});
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

	{#if ready}
		{#if adding}
			<form class="own" onsubmit={addOwn} use:outside={() => (adding = false)}>
				<h2 class="label">Add an item</h2>
				<label class="sr-only" for="{id}-add-item">Item</label>
				<input
					bind:this={itemField}
					id="{id}-add-item"
					class="item-field"
					type="text"
					autocomplete="off"
					placeholder="Lemons, kitchen roll..."
					bind:value={own}
				/>
				<div class="own-row">
					<label class="sr-only" for="{id}-add-qty">Quantity</label>
					<input
						id="{id}-add-qty"
						class="qty-field"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						placeholder="Qty"
						bind:value={ownQty}
					/>
					<label class="sr-only" for="{id}-add-unit">Unit</label>
					<select id="{id}-add-unit" bind:value={ownUnit}>
						<option value="">no unit</option>
						{#each units as unit (unit)}
							<option value={unit}>{unitLabel(unit)}</option>
						{/each}
					</select>
					<button type="submit" disabled={!own.trim()}><Icon name="plus" />Add</button>
				</div>
				{#if noting}
					<label class="sr-only" for="{id}-add-note">Note</label>
					<input
						id="{id}-add-note"
						class="note-field"
						type="text"
						autocomplete="off"
						placeholder="A note, such as 'the big pack'"
						bind:value={ownNote}
					/>
				{:else}
					<button type="button" class="add-note" onclick={() => (noting = true)}>
						<Icon name="plus" size={14} />Add a note
					</button>
				{/if}
			</form>
		{:else}
			<button type="button" class="start" onclick={startAdding}>
				<Icon name="plus" />Add an item
			</button>
		{/if}
	{/if}

	{#if !ready}
		<p class="empty" role="status">Loading your list...</p>
	{:else if merged.length === 0}
		<p class="empty">Your list is empty. Add ingredients from any recipe, or type an item above.</p>
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
				<button
					type="button"
					class:danger={confirming}
					onclick={clearAll}
					use:outside={() => (confirming = false)}
				>
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
						{#each group.lines as line, n (line.key)}
							<IngredientLine
								id="{id}-{group.id}-{n}"
								text={[line.prefix, line.item].filter(Boolean).join(' ')}
								toTaste={line.toTaste}
								flush
								notes={[
									line.note ?? '',
									line.edited ? `Recipe: ${line.original || 'no amount'}` : '',
									view === 'type' && group.id !== OWN_ITEMS ? sources(line) : ''
								]}
								checked={shopping.isTicked(line.key)}
								ontoggle={() => shopping.toggle(line.key)}
								onremove={() => removeLine(line)}
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
									disabled={shopping.isTicked(line.key)}
									onset={(qty) =>
										ownOnly(line)
											? shopping.setOwnAmount(line.key, qty)
											: qty === line.needed
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

	.own {
		display: grid;
		gap: var(--space-2);
		max-inline-size: 36rem;
	}

	.own-row {
		display: flex;
		gap: var(--space-2);
	}

	.own .qty-field {
		flex: 0 0 5rem;
		text-align: center;
	}

	.own select {
		flex: 1;
		padding-inline: var(--space-2);
	}

	.own input,
	.own select {
		flex: 1;
		min-inline-size: 0;
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border: 1px solid var(--colour-muted);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-ink);
		font: inherit;
	}

	.start {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-2);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 1px dashed var(--colour-primary);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		font-weight: 700;
	}

	.start:hover {
		background: var(--colour-tint);
	}

	.add-note {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-1);
		min-block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-primary);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.own-row button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 0;
		border-radius: var(--radius-s);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-weight: 700;
	}

	.own-row button:disabled {
		opacity: 0.5;
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
