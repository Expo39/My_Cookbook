<script lang="ts">
	import '$lib/styles/admin.css';
	import { SvelteSet } from 'svelte/reactivity';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { moveItem, removeItem } from '$lib/admin/lists';
	import { emptyGroup, emptyRow, UNITS, type GroupForm } from '$lib/admin/recipe-form';
	import Icon from '../Icon.svelte';
	import InfoTip from '../InfoTip.svelte';
	import FieldSet from './FieldSet.svelte';
	import IngredientRowFields from './IngredientRowFields.svelte';
	import PasteIngredients, { type PastedPart } from './PasteIngredients.svelte';
	import RowList from './RowList.svelte';
	import TextField from './TextField.svelte';

	let { ed }: { ed: EditorState } = $props();

	let paste: PasteIngredients;
	let pasteInto = $state(0);
	const folded = new SvelteSet<string>();

	const groups = $derived(ed.form.groups);
	const hasTotal = (group: GroupForm) => !!(group.totalQty || group.totalMax || group.totalUnit);
	const isBlank = (group: GroupForm) =>
		group.items.length === 1 && !group.items[0].item.trim() && !group.items[0].qtyMin;
	/** A recipe in parts shows each part's name and total; a plain list has neither. */
	const split = $derived(groups.length > 1 || !!groups[0]?.name.trim() || hasTotal(groups[0]));

	/** The first earlier part with the same name, which a reader would take for the same part. */
	function twinOf(g: number): number {
		const name = groups[g].name.trim().toLowerCase();
		return name ? groups.findIndex((other) => other.name.trim().toLowerCase() === name) : -1;
	}

	function merge(g: number, into: number) {
		groups[into].items.push(...groups[g].items);
		removeItem(groups, g);
	}

	function openPaste(g: number) {
		pasteInto = g;
		paste.show();
	}

	function addPasted(parts: PastedPart[]) {
		const target = groups[pasteInto] ?? groups[0];
		let at = groups.indexOf(target);
		parts.forEach((part, n) => {
			const intoTarget = n === 0 && (!part.name || (isBlank(target) && !target.name.trim()));
			if (intoTarget) {
				if (part.name) target.name = part.name;
				target.items = isBlank(target) ? part.rows : [...target.items, ...part.rows];
			} else {
				groups.splice(++at, 0, { ...emptyGroup(), name: part.name, items: part.rows });
			}
		});
	}

	function totalText(group: GroupForm): string {
		const qty = group.totalMax ? `${group.totalQty}-${group.totalMax}` : group.totalQty;
		return `${group.name.trim() || 'This part'} ${qty} ${group.totalUnit} total`.replace(
			/\s+/g,
			' '
		);
	}

	const count = (n: number) => `${n} ${n === 1 ? 'ingredient' : 'ingredients'}`;
</script>

{#snippet total(group: GroupForm, g: number)}
	{@const error = ed.errorFor(`ingredientGroups[${g}].total.qty`)}
	<details class="total" open={hasTotal(group) || !!error}>
		<summary>Total for this part <span class="opt">optional</span></summary>
		<div class="total-body">
			<p class="help">
				Shown beside the part's name, for a part weighed out as a whole, such as a cheese board.
			</p>
			<div class="total-fields">
				<TextField
					id="f-ingredientGroups-{g}-total-qty"
					label="Total"
					bind:value={group.totalQty}
					inputmode="decimal"
					numeric
					{error}
				/>
				<TextField
					id="f-ingredientGroups-{g}-total-max"
					label="Up to"
					bind:value={group.totalMax}
					inputmode="decimal"
					numeric
					optional
				/>
				<div class="unit">
					<label for="f-ingredientGroups-{g}-total-unit">Unit</label>
					<select
						id="f-ingredientGroups-{g}-total-unit"
						class="control"
						bind:value={group.totalUnit}
					>
						{#each UNITS as unit (unit.value)}
							<option value={unit.value}>{unit.label}</option>
						{/each}
					</select>
				</div>
			</div>
			{#if group.totalQty}
				<p class="example"><span class="label">Reads as</span>{totalText(group)}</p>
			{/if}
		</div>
	</details>
{/snippet}

{#snippet part(group: GroupForm, g: number)}
	{@const twin = twinOf(g)}
	{@const open = !folded.has(group.uid)}
	<div class="part-head">
		<h3 class="label">Part {g + 1}</h3>
		<span class="count">{count(group.items.length)}</span>
		<button
			type="button"
			class="fold"
			aria-expanded={open}
			aria-label="{open ? 'Fold' : 'Open'} part {g + 1}"
			onclick={() => (open ? folded.add(group.uid) : folded.delete(group.uid))}
		>
			<Icon name="chevronDown" size={20} />
		</button>
	</div>
	<TextField
		id="f-ingredientGroups-{g}-name"
		label="Name of this part"
		bind:value={group.name}
		hint="Such as 'For the sauce'. It is shown as a heading over these ingredients."
	/>
	{#if twin !== g && twin >= 0}
		<div class="warning" role="status">
			<p>
				<Icon name="alert" size={16} />Part {twin + 1} is also called "{group.name.trim()}". On the
				recipe they show as two separate lists with the same heading.
			</p>
			<button type="button" class="btn" onclick={() => merge(g, twin)}>
				Move these into part {twin + 1}
			</button>
		</div>
	{/if}
	{#if open}{@render total(group, g)}{/if}
	{#if !open}
		<p class="preview">
			{group.items
				.map((row) => row.item.trim())
				.filter(Boolean)
				.join(', ') || 'No ingredients yet'}
		</p>
	{/if}
{/snippet}

<FieldSet legend="Ingredients">
	{#if ed.errorFor('ingredientGroups')}
		<p class="error" role="alert" id="f-ingredientGroups">
			<Icon name="alert" size={16} />{ed.errorFor('ingredientGroups')}
		</p>
	{/if}

	<RowList
		items={groups}
		noun="part"
		canRemove={groups.length > 1}
		onmove={(from, to) => moveItem(groups, from, to)}
		onremove={(index) => removeItem(groups, index)}
	>
		{#snippet row(group, g)}
			<div class="group" id="f-ingredientGroups-{g}" tabindex="-1">
				{#if split}{@render part(group, g)}{/if}

				{#if !folded.has(group.uid) || !split}
					{#if isBlank(group)}
						<div class="paste-first">
							<p>
								The quickest way is to type or paste the whole list, one ingredient per line, such
								as "400 g spaghetti". A line ending in a colon starts a new part.
							</p>
							<button
								type="button"
								class="btn primary"
								disabled={!ed.coreReady}
								onclick={() => openPaste(g)}
							>
								<Icon name="plus" size={18} />Type or paste a list
							</button>
						</div>
					{/if}

					<RowList
						items={group.items}
						noun="ingredient"
						compact
						canRemove={group.items.length > 1}
						onmove={(from, to) => moveItem(group.items, from, to)}
						onremove={(index) => removeItem(group.items, index)}
					>
						{#snippet row(item, i)}
							<IngredientRowFields {ed} row={item} path="ingredientGroups[{g}].items[{i}]" />
						{/snippet}
					</RowList>

					<div class="buttons">
						<button type="button" class="btn" onclick={() => group.items.push(emptyRow())}>
							<Icon name="plus" size={18} />Add an ingredient
						</button>
						{#if !isBlank(group)}
							<button
								type="button"
								class="btn"
								disabled={!ed.coreReady}
								onclick={() => openPaste(g)}
							>
								Paste more
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/snippet}
	</RowList>

	<div class="split">
		<button type="button" class="btn" onclick={() => groups.push(emptyGroup())}>
			<Icon name="plus" size={18} />{split ? 'Add another part' : 'Split into parts'}
		</button>
		<InfoTip
			topic="a part"
			text="Use parts when a recipe is made in pieces, such as the pastry and the filling. Each part gets its own heading and list. A simple recipe needs only one list."
		/>
	</div>
</FieldSet>

<PasteIngredients bind:this={paste} ready={ed.coreReady} onadd={addPasted} />

<style>
	.group {
		display: grid;
		gap: var(--space-4);
	}

	.group:focus {
		outline: none;
	}

	.part-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.part-head .label {
		color: var(--colour-primary);
	}

	.count {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.fold {
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		margin-inline-start: auto;
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		background: transparent;
		color: var(--colour-primary);
	}

	.fold:hover {
		background: var(--colour-tint);
	}

	.fold :global(svg) {
		transition: transform var(--duration-micro) var(--ease-out);
	}

	.fold[aria-expanded='true'] :global(svg) {
		transform: rotate(180deg);
	}

	.preview {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.warning {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		padding: var(--space-3);
		border-inline-start: 3px solid var(--colour-warning);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-warning);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.warning p {
		display: flex;
		gap: var(--space-1);
		align-items: flex-start;
	}

	.warning :global(svg) {
		flex: none;
		margin-block-start: 0.15em;
	}

	.total summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		color: var(--colour-primary);
		font-weight: 700;
	}

	.opt {
		color: var(--colour-muted);
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.total-body,
	.total-fields {
		display: grid;
		gap: var(--space-3);
	}

	.unit {
		display: grid;
		gap: var(--space-1);
		align-content: start;
	}

	.unit label {
		font-weight: 700;
	}

	.example {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		font-weight: 700;
	}

	.example .label {
		color: var(--colour-muted);
	}

	.paste-first {
		display: grid;
		gap: var(--space-3);
		justify-items: start;
		padding: var(--space-4);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
	}

	.buttons,
	.split {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.split {
		gap: var(--space-1);
	}

	@media (min-width: 40rem) {
		.total-fields {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
