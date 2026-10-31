<script lang="ts">
	import '$lib/styles/admin.css';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import { groupsToText, textToGroups } from '$lib/admin/ingredient-text';
	import { moveItem, removeItem } from '$lib/admin/lists';
	import {
		emptyGroup,
		emptyRow,
		UNITS,
		type GroupForm,
		type IngredientRow
	} from '$lib/admin/recipe-form';
	import Icon from '../Icon.svelte';
	import InfoTip from '../InfoTip.svelte';
	import Segmented from '../Segmented.svelte';
	import FieldSet from './FieldSet.svelte';
	import IngredientRowFields from './IngredientRowFields.svelte';
	import RowList from './RowList.svelte';
	import TextField from './TextField.svelte';

	let { ed }: { ed: EditorState } = $props();

	const uid = $props.id();
	/** Writing the list is the main way in; going line by line is for fine-tuning. */
	let mode = $state<'write' | 'lines'>('write');
	const folded = new SvelteSet<string>();

	const groups = $derived(ed.form.groups);

	/** Stays in view while the cook types, unlike the placeholder. */
	const EXAMPLES = [
		['400 g plain flour', 'an amount, then the ingredient'],
		['2-3 cloves garlic', 'a range'],
		['1 lemon, zested', 'after a comma: how to prepare it'],
		['Zest of 1 lemon', 'words before the amount'],
		['salt to taste', 'no amount'],
		['1 tbsp honey (optional)', 'can be left out'],
		['For the filling:', 'starts a new part, with a heading']
	];
	const count = (n: number) => `${n} ${n === 1 ? 'ingredient' : 'ingredients'}`;

	/*
	 * The written list and the parts are two views of one thing. Typing rebuilds the parts; a change
	 * made anywhere else (line by line, a restored draft, an import) rewrites the list, while the
	 * cook's own spacing survives their typing.
	 */
	const written = $derived(groupsToText(groups));
	let text = $state(untrack(() => written));
	let mine = untrack(() => written);

	$effect(() => {
		if (written !== mine) text = mine = written;
	});

	function typed() {
		const next = textToGroups(text, groups);
		ed.form.groups = next;
		mine = groupsToText(next);
	}

	function amountText(row: IngredientRow): string {
		if (row.scale === 'toTaste' && !row.qtyMin) return 'to taste';
		const qty = row.qtyMax ? `${row.qtyMin}-${row.qtyMax}` : row.qtyMin;
		const unit = row.unit ? (UNITS.find((u) => u.value === row.unit)?.label ?? '') : '';
		return [qty, unit].filter(Boolean).join(' ');
	}

	/** A name that starts with a number usually means the amount was not recognised. */
	const doubtful = (row: IngredientRow) => /^\d/.test(row.item.trim());

	const hasTotal = (group: GroupForm) => !!(group.totalQty || group.totalMax || group.totalUnit);
	/** A recipe in parts shows each part's name and total; a plain list has neither. */
	const split = $derived(groups.length > 1 || !!groups[0]?.name.trim() || hasTotal(groups[0]));

	/** The first earlier part with the same name, which a reader would take for the same part. */
	function twinOf(g: number): number {
		const name = groups[g].name.trim().toLowerCase();
		return name ? groups.findIndex((other) => other.name.trim().toLowerCase() === name) : -1;
	}

	const twins = $derived(groups.some((_, g) => twinOf(g) !== g && twinOf(g) >= 0));

	function merge(g: number, into: number) {
		groups[into].items.push(...groups[g].items);
		removeItem(groups, g);
	}

	function totalText(group: GroupForm): string {
		const qty = group.totalMax ? `${group.totalQty}-${group.totalMax}` : group.totalQty;
		return `${qty} ${group.totalUnit} total`.replace(/\s+/g, ' ');
	}
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
				<p class="example">
					<span class="label">Reads as</span>{group.name.trim() || 'This part'}
					{totalText(group)}
				</p>
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
	{#if open}
		{@render total(group, g)}
	{:else}
		<p class="muted">
			{group.items
				.map((row) => row.item.trim())
				.filter(Boolean)
				.join(', ') || 'No ingredients yet'}
		</p>
	{/if}
{/snippet}

<FieldSet legend="Ingredients">
	<Segmented
		legend="How to enter them"
		name="{uid}-mode"
		hideLegend
		value={mode}
		options={[
			{ value: 'write', label: 'Write the list' },
			{ value: 'lines', label: 'Line by line' }
		]}
		onchange={(value) => (mode = value as 'write' | 'lines')}
	/>

	{#if ed.errorFor('ingredientGroups')}
		<p class="error" role="alert">
			<Icon name="alert" size={16} />{ed.errorFor('ingredientGroups')}
		</p>
	{/if}

	{#if mode === 'write'}
		<div class="room">
			<div class="write">
				<div class="field">
					<div class="field-head">
						<label for={fieldId('ingredientGroups')}>One ingredient per line</label>
						<InfoTip
							topic="the ingredient list"
							text={'Write it the way you would on paper: "400 g plain flour", "2 eggs", "salt to taste", "1 lemon, zested". Add "(optional)" for anything that can be left out. A line ending in a colon, such as "For the filling:", starts a new part with its own heading.'}
						/>
					</div>
					<textarea
						id={fieldId('ingredientGroups')}
						class="control list"
						rows="10"
						placeholder={'400 g plain flour\n2 eggs\n1 lemon, zested\nsalt to taste'}
						disabled={!ed.coreReady}
						bind:value={text}
						oninput={typed}
					></textarea>
					<p class="help">
						Copy a list from anywhere and paste it in. Bullets, numbers and extra spaces are tidied
						away.
					</p>
					<details class="examples" open>
						<summary>Ways to write a line</summary>
						<dl>
							{#each EXAMPLES as [line, meaning] (line)}
								<dt>{line}</dt>
								<dd>{meaning}</dd>
							{/each}
						</dl>
					</details>
				</div>

				<div class="preview" aria-live="polite">
					<h3 class="label">How it will read</h3>
					{#if groups.some((group) => group.items.length)}
						{#each groups as group (group.uid)}
							{#if group.name.trim()}
								<p class="part">
									{group.name.trim()}
									{#if group.totalQty}<span class="muted">{totalText(group)}</span>{/if}
								</p>
							{/if}
							<ul>
								{#each group.items as row (row.uid)}
									<li class:doubt={doubtful(row)}>
										<span class="amount num">{row.prefix ? '' : amountText(row)}</span>
										<span>
											{row.prefix
												? `${row.prefix} ${amountText(row)} ${row.item}`.replace(/\s+/g, ' ')
												: row.item}{#if row.note}<span class="muted">, {row.note}</span>{/if}
											{#if row.optional}<span class="tag">optional</span>{/if}
											{#if doubtful(row)}
												<span class="check">
													<Icon name="alert" size={14} />Check this line: the amount may not have
													been recognised.
												</span>
											{/if}
										</span>
									</li>
								{/each}
							</ul>
						{/each}
						{#if twins}
							<p class="check">
								<Icon name="alert" size={14} />Two parts have the same name. Give them different
								names, or put their lines under one heading.
							</p>
						{/if}
					{:else}
						<p class="muted">
							Your ingredients appear here as you type, the way the recipe will show them.
						</p>
					{/if}
				</div>
			</div>
		</div>
	{:else}
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

					{#if !split || !folded.has(group.uid)}
						<RowList
							items={group.items}
							noun="ingredient"
							compact
							onmove={(from, to) => moveItem(group.items, from, to)}
							onremove={(index) => removeItem(group.items, index)}
						>
							{#snippet row(item, i)}
								<IngredientRowFields {ed} row={item} path="ingredientGroups[{g}].items[{i}]" />
							{/snippet}
						</RowList>
						<button type="button" class="btn add" onclick={() => group.items.push(emptyRow())}>
							<Icon name="plus" size={18} />Add an ingredient
						</button>
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
	{/if}
</FieldSet>

<style>
	/* The list and its preview sit side by side when there is room, one above the other when not. */
	.room {
		container-type: inline-size;
	}

	.write {
		display: grid;
		gap: var(--space-4);
	}

	@container (min-width: 40rem) {
		.write {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}

	.field {
		display: grid;
		gap: var(--space-2);
		align-content: start;
	}

	.field-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.field-head label {
		font-weight: 700;
	}

	.list {
		min-block-size: 12rem;
		field-sizing: content;
		line-height: 1.7;
	}

	.examples summary {
		min-block-size: var(--target);
		align-content: center;
		color: var(--colour-primary);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.examples dl {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-1) var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		font-size: var(--text-s);
	}

	.examples dt {
		font-family: var(--font-num);
		font-weight: 600;
	}

	.examples dd {
		margin: 0;
		color: var(--colour-muted);
	}

	.preview {
		display: grid;
		gap: var(--space-2);
		align-content: start;
		padding: var(--space-4);
		border: 1px dashed var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	.preview .label {
		color: var(--colour-muted);
	}

	.preview ul {
		display: grid;
	}

	.preview li {
		display: grid;
		grid-template-columns: var(--amount-slot) minmax(0, 1fr);
		gap: var(--space-3);
		padding-block: var(--space-1);
		border-block-end: 1px dashed var(--colour-line);
	}

	.preview li.doubt {
		background: var(--colour-tint);
	}

	.amount {
		color: var(--colour-primary);
		text-align: end;
	}

	.part {
		margin-block-start: var(--space-2);
		color: var(--colour-primary);
		font-weight: 700;
	}

	.muted {
		color: var(--colour-muted);
	}

	.tag {
		margin-inline-start: var(--space-1);
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
		color: var(--colour-primary);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--colour-warning);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.group {
		display: grid;
		gap: var(--space-4);
	}

	.group:focus {
		outline: none;
	}

	.add {
		justify-self: start;
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

	.split {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	@media (min-width: 40rem) {
		.total-fields {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
