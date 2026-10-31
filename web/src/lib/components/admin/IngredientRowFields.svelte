<script lang="ts">
	import '$lib/styles/admin.css';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import { SCALE_MODES, UNITS, type IngredientRow } from '$lib/admin/recipe-form';
	import { suggestKey } from '$lib/admin/slug';
	import Icon from '../Icon.svelte';
	import Field from './Field.svelte';
	import TextField from './TextField.svelte';

	/**
	 * One ingredient on one line: amount, unit, ingredient and note. The rarer fields wait behind
	 * "More", and a folded row lists the ones that are set, so nothing is hidden by surprise.
	 */
	let { ed, row, path }: { ed: EditorState; row: IngredientRow; path: string } = $props();

	const id = (part: string) => fieldId(`${path}.${part}`);
	const qtyPath = $derived(`${path}.amount.qty`);
	const itemPath = $derived(`${path}.item`);
	const keyPath = $derived(`${path}.key`);

	const mode = $derived(SCALE_MODES.find((m) => m.value === row.scale));
	const suggestion = $derived(row.item.trim() ? suggestKey(row.item, ed.keys) : '');
	const errors = $derived([ed.errorFor(qtyPath), ed.errorFor(itemPath)].filter(Boolean));
	const set = $derived(
		[
			row.optional && 'optional',
			row.scale !== 'linear' && mode?.label.toLowerCase(),
			row.qtyMax && `up to ${row.qtyMax}`,
			row.prefix && `"${row.prefix}"`,
			row.key && `key: ${row.key}`
		].filter(Boolean) as string[]
	);

	let more = $state(false);
	$effect(() => {
		if (ed.errorFor(keyPath)) more = true;
	});
</script>

<div class="row" id={fieldId(path)} tabindex="-1">
	<div class="line">
		<label class="sr-only" for={id('amount.qty')}>Amount</label>
		<input
			id={id('amount.qty')}
			class="control num qty"
			inputmode="decimal"
			autocomplete="off"
			placeholder="250"
			bind:value={row.qtyMin}
			aria-invalid={ed.errorFor(qtyPath) ? 'true' : undefined}
			onblur={() => ed.touch(qtyPath)}
		/>
		<label class="sr-only" for={id('amount.unit')}>Unit</label>
		<select id={id('amount.unit')} class="control unit" bind:value={row.unit}>
			{#each UNITS as unit (unit.value)}
				<option value={unit.value}>{unit.value ? unit.label : 'none'}</option>
			{/each}
		</select>
		<label class="sr-only" for={id('item')}>Ingredient</label>
		<input
			id={id('item')}
			class="control item"
			autocomplete="off"
			placeholder="Ingredient, such as plain flour"
			bind:value={row.item}
			aria-invalid={ed.errorFor(itemPath) ? 'true' : undefined}
			onblur={() => ed.touch(itemPath)}
		/>
		<label class="sr-only" for={id('note')}>Note</label>
		<input
			id={id('note')}
			class="control note"
			autocomplete="off"
			placeholder="Note, such as finely chopped"
			bind:value={row.note}
		/>
	</div>

	{#each errors as error (error)}
		<p class="error" role="alert"><Icon name="alert" size={16} />{error}</p>
	{/each}

	<div class="extras">
		<button type="button" class="toggle" aria-expanded={more} onclick={() => (more = !more)}>
			<Icon name="chevronDown" size={16} />{more ? 'Fewer options' : 'More options'}
		</button>
		{#if !more}
			{#each set as chip (chip)}<span class="chip">{chip}</span>{/each}
		{/if}
	</div>

	{#if more}
		<div class="more">
			<label class="check">
				<input type="checkbox" bind:checked={row.optional} />
				<span>Optional ingredient</span>
			</label>
			<Field
				id={id('scale')}
				label="When the servings change"
				hint={mode?.help}
				info="Most amounts double when the servings double. Eggs round to whole ones, and salt or 'to taste' lines grow more gently or not at all."
			>
				<select
					class="control"
					id={id('scale')}
					bind:value={row.scale}
					aria-describedby="{id('scale')}-hint"
				>
					{#each SCALE_MODES as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</Field>
			<TextField
				id={id('amount.max')}
				label="Up to"
				bind:value={row.qtyMax}
				inputmode="decimal"
				numeric
				optional
				hint="For a range, as in 2 to 3 cloves"
			/>
			<TextField
				id={id('prefix')}
				label="Before the amount"
				bind:value={row.prefix}
				optional
				hint="As in 'Zest of' 1 lemon"
			/>
			<TextField
				id={id('key')}
				label="Key"
				bind:value={row.key}
				optional
				info="A short name for this ingredient. The method can then mention it, and its amount follows the servings there too."
				error={ed.errorFor(keyPath)}
				onblur={() => ed.touch(keyPath)}
			/>
			{#if !row.key && suggestion}
				<button type="button" class="btn suggest" onclick={() => (row.key = suggestion)}>
					Use "{suggestion}" as the key
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Sized by its own width, since the form shares the screen with the preview on a desk. */
	.row {
		display: grid;
		gap: var(--space-2);
		container-type: inline-size;
	}

	.row:focus {
		outline: none;
	}

	/* Narrow: amount and unit, then the words below. Wider: one line, with the note below or beside. */
	.line {
		display: grid;
		grid-template-columns: 5rem minmax(0, 1fr);
		gap: var(--space-2);
	}

	.qty {
		text-align: center;
	}

	.item,
	.note {
		grid-column: 1 / -1;
	}

	.extras {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-primary);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.toggle :global(svg) {
		transition: transform var(--duration-micro) var(--ease-out);
	}

	.toggle[aria-expanded='true'] :global(svg) {
		transform: rotate(180deg);
	}

	.chip {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
		color: var(--colour-primary);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.more {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
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

	@container (min-width: 20rem) {
		.line {
			grid-template-columns: 4rem 6rem minmax(0, 1fr);
		}

		.item {
			grid-column: auto;
		}
	}

	@container (min-width: 40rem) {
		.line {
			grid-template-columns: 4rem 6rem minmax(0, 1.4fr) minmax(0, 1fr);
		}

		.note {
			grid-column: auto;
		}
	}

	@container (min-width: 30rem) {
		.more {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
		}
	}
</style>
