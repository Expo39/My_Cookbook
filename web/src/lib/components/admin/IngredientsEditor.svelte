<script lang="ts">
	import '$lib/styles/admin.css';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { moveItem, removeItem } from '$lib/admin/lists';
	import {
		emptyGroup,
		emptyRow,
		UNITS,
		type GroupForm,
		type IngredientRow
	} from '$lib/admin/recipe-form';
	import Icon from '../Icon.svelte';
	import FieldSet from './FieldSet.svelte';
	import IngredientRowFields from './IngredientRowFields.svelte';
	import PasteIngredients from './PasteIngredients.svelte';
	import RowList from './RowList.svelte';
	import TextField from './TextField.svelte';

	/** `simple` leads with pasting a list and folds the group totals away. */
	let { ed, simple = false }: { ed: EditorState; simple?: boolean } = $props();

	let paste: PasteIngredients;
	let pasteInto = $state(0);

	function openPaste(group: number) {
		pasteInto = group;
		paste.show();
	}

	function addPasted(rows: IngredientRow[]) {
		const group = ed.form.groups[pasteInto] ?? ed.form.groups[0];
		const blank = group.items.length === 1 && !group.items[0].item.trim() && !group.items[0].qtyMin;
		if (blank) group.items = rows;
		else group.items.push(...rows);
	}
</script>

{#snippet total(group: GroupForm, g: number)}
	<TextField
		id="f-ingredientGroups-{g}-total-qty"
		label="Headline total"
		bind:value={group.totalQty}
		inputmode="decimal"
		numeric
		optional
		hint="Shown in the group name, such as 1150 g of cheese"
		error={ed.errorFor(`ingredientGroups[${g}].total.qty`)}
	/>
	<TextField
		id="f-ingredientGroups-{g}-total-max"
		label="Total up to"
		bind:value={group.totalMax}
		inputmode="decimal"
		numeric
		optional
		hint="For a range"
	/>
	<div class="unit">
		<label for="f-ingredientGroups-{g}-total-unit">Total unit</label>
		<select id="f-ingredientGroups-{g}-total-unit" class="control" bind:value={group.totalUnit}>
			{#each UNITS as unit (unit.value)}
				<option value={unit.value}>{unit.label}</option>
			{/each}
		</select>
	</div>
{/snippet}

<FieldSet legend="Ingredients">
	{#if simple}
		<div class="paste-first">
			<p>
				The quickest way is to paste or type the whole list, one ingredient per line, such as "400 g
				spaghetti". Each line is read into its own row, ready to check.
			</p>
			<button
				type="button"
				class="btn primary"
				disabled={!ed.coreReady}
				onclick={() => openPaste(0)}
			>
				<Icon name="plus" size={18} />Paste a list
			</button>
		</div>
	{/if}
	<p class="help">
		Split the list into groups when the recipe has parts, such as "For the sauce". A group with one
		part needs no name.
	</p>
	{#if ed.errorFor('ingredientGroups')}
		<p class="error" role="alert" id="f-ingredientGroups">
			<Icon name="alert" size={16} />{ed.errorFor('ingredientGroups')}
		</p>
	{/if}

	<RowList
		items={ed.form.groups}
		noun="group"
		canRemove={ed.form.groups.length > 1}
		onmove={(from, to) => moveItem(ed.form.groups, from, to)}
		onremove={(index) => removeItem(ed.form.groups, index)}
	>
		{#snippet row(group, g)}
			<div class="group" id="f-ingredientGroups-{g}" tabindex="-1">
				<div class="group-head">
					<TextField
						id="f-ingredientGroups-{g}-name"
						label="Group name"
						bind:value={group.name}
						optional
						hint="Such as 'For the sauce'"
					/>
					{#if !simple}{@render total(group, g)}{/if}
				</div>
				{#if simple}
					<details class="totals">
						<summary>Group total (optional)</summary>
						<div class="total-fields">{@render total(group, g)}</div>
					</details>
				{/if}

				<RowList
					items={group.items}
					noun="ingredient"
					canRemove={group.items.length > 1}
					onmove={(from, to) => moveItem(group.items, from, to)}
					onremove={(index) => removeItem(group.items, index)}
				>
					{#snippet row(item, i)}
						<IngredientRowFields {ed} row={item} path="ingredientGroups[{g}].items[{i}]" {simple} />
					{/snippet}
				</RowList>

				<div class="buttons">
					<button type="button" class="btn" onclick={() => group.items.push(emptyRow())}>
						<Icon name="plus" size={18} />Add an ingredient
					</button>
					<button type="button" class="btn" disabled={!ed.coreReady} onclick={() => openPaste(g)}>
						{simple ? 'Paste more' : 'Paste ingredients'}
					</button>
				</div>
			</div>
		{/snippet}
	</RowList>

	<button type="button" class="btn add" onclick={() => ed.form.groups.push(emptyGroup())}>
		<Icon name="plus" size={18} />Add a group
	</button>
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

	.group-head {
		display: grid;
		gap: var(--space-3);
		align-items: start;
	}

	.paste-first {
		display: grid;
		gap: var(--space-3);
		justify-items: start;
		padding: var(--space-4);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
	}

	.totals summary {
		color: var(--colour-primary);
		font-weight: 700;
		cursor: pointer;
	}

	.total-fields {
		display: grid;
		gap: var(--space-3);
		padding-block-start: var(--space-3);
	}

	.unit {
		display: grid;
		gap: var(--space-1);
		align-content: start;
	}

	.unit label {
		font-weight: 700;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.add {
		justify-self: start;
	}

	@media (min-width: 40rem) {
		.group-head:has(> :nth-child(2)) {
			grid-template-columns: 2fr 1fr 1fr 1fr;
		}

		.total-fields {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
