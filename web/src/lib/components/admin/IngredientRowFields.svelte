<script lang="ts">
	import '$lib/styles/admin.css';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import { SCALE_MODES, UNITS, type IngredientRow } from '$lib/admin/recipe-form';
	import { suggestKey } from '$lib/admin/slug';
	import Field from './Field.svelte';
	import TextField from './TextField.svelte';

	/** `simple` keeps the fields most lines need in view and folds the rest under "More options". */
	let {
		ed,
		row,
		path,
		simple = false
	}: { ed: EditorState; row: IngredientRow; path: string; simple?: boolean } = $props();

	const mode = $derived(SCALE_MODES.find((m) => m.value === row.scale));
	const suggestion = $derived(row.item.trim() ? suggestKey(row.item, ed.keys) : '');
	const qtyPath = $derived(`${path}.amount.qty`);
</script>

{#snippet upTo()}
	<TextField
		id={fieldId(`${path}.amount.max`)}
		label="Up to"
		bind:value={row.qtyMax}
		inputmode="decimal"
		numeric
		optional
		hint="For a range"
	/>
{/snippet}

{#snippet before()}
	<TextField
		id={fieldId(`${path}.prefix`)}
		label="Before the amount"
		bind:value={row.prefix}
		optional
		hint="As in 'Zest of'"
	/>
{/snippet}

{#snippet scaling()}
	<Field id={fieldId(`${path}.scale`)} label="When the servings change" hint={mode?.help}>
		<select
			class="control"
			id={fieldId(`${path}.scale`)}
			bind:value={row.scale}
			aria-describedby="{fieldId(`${path}.scale`)}-hint"
		>
			{#each SCALE_MODES as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</Field>
{/snippet}

{#snippet naming()}
	<TextField
		id={fieldId(`${path}.key`)}
		label="Key"
		bind:value={row.key}
		optional
		hint="A short name, used only to mention this ingredient in the method."
		error={ed.errorFor(`${path}.key`)}
		onblur={() => ed.touch(`${path}.key`)}
	/>
	{#if !row.key && suggestion}
		<button type="button" class="btn suggest" onclick={() => (row.key = suggestion)}>
			Use "{suggestion}" as the key
		</button>
	{/if}
{/snippet}

<div class="row" id={fieldId(path)} tabindex="-1">
	<div class="amount" class:pair={simple}>
		<TextField
			id={fieldId(qtyPath)}
			label="Amount"
			bind:value={row.qtyMin}
			inputmode="decimal"
			numeric
			hint="Such as 250 or 1/2"
			error={ed.errorFor(qtyPath)}
			onblur={() => ed.touch(qtyPath)}
		/>
		{#if !simple}{@render upTo()}{/if}
		<Field id={fieldId(`${path}.amount.unit`)} label="Unit">
			<select class="control" id={fieldId(`${path}.amount.unit`)} bind:value={row.unit}>
				{#each UNITS as unit (unit.value)}
					<option value={unit.value}>{unit.label}</option>
				{/each}
			</select>
		</Field>
	</div>
	<div class="what" class:pair={simple}>
		{#if !simple}{@render before()}{/if}
		<TextField
			id={fieldId(`${path}.item`)}
			label="Ingredient"
			bind:value={row.item}
			error={ed.errorFor(`${path}.item`)}
			onblur={() => ed.touch(`${path}.item`)}
		/>
		<TextField
			id={fieldId(`${path}.note`)}
			label="Note"
			bind:value={row.note}
			optional
			hint="Shown after a comma, as in 'finely chopped'"
		/>
	</div>
	<div class="more">
		{#if !simple}{@render scaling()}{@render naming()}{/if}
		<label class="check">
			<input type="checkbox" bind:checked={row.optional} />
			<span>Optional ingredient</span>
		</label>
		{#if simple}
			<label class="check">
				<input
					type="checkbox"
					bind:checked={
						() => row.scale === 'toTaste', (taste) => (row.scale = taste ? 'toTaste' : 'linear')
					}
				/>
				<span>To taste, no amount</span>
			</label>
		{/if}
	</div>
	{#if simple}
		<details class="options">
			<summary>More options</summary>
			<div class="option-fields">
				{@render upTo()}
				{@render before()}
				{@render scaling()}
				{@render naming()}
			</div>
		</details>
	{/if}
</div>

<style>
	.row {
		display: grid;
		gap: var(--space-3);
	}

	.row:focus {
		outline: none;
	}

	.amount,
	.what,
	.more {
		display: grid;
		gap: var(--space-3);
		align-items: start;
	}

	.options summary {
		color: var(--colour-primary);
		font-weight: 700;
		cursor: pointer;
	}

	.option-fields {
		display: grid;
		gap: var(--space-3);
		padding-block-start: var(--space-3);
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
	}

	.check input {
		inline-size: 1.25rem;
		block-size: 1.25rem;
		accent-color: var(--colour-primary);
	}

	.suggest {
		justify-self: start;
	}

	@media (min-width: 40rem) {
		.amount {
			grid-template-columns: 1fr 1fr 1.2fr;
		}

		.what {
			grid-template-columns: 1fr 1.6fr 1.6fr;
		}

		.pair.amount {
			grid-template-columns: 1fr 1.6fr;
		}

		.pair.what {
			grid-template-columns: 1.6fr 1fr;
		}
	}
</style>
