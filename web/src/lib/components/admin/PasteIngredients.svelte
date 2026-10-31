<script lang="ts" module>
	import type { IngredientRow } from '$lib/admin/recipe-form';

	/** A line ending in a colon, such as "For the sauce:", starts a new part, as in most cookbooks. */
	export interface PastedPart {
		name: string;
		rows: IngredientRow[];
	}
</script>

<script lang="ts">
	import '$lib/styles/admin.css';
	import { parseIngredientLine } from '$lib/core';
	import { rowFromIngredient } from '$lib/admin/recipe-form';
	import type { Ingredient } from '$lib/types/recipe';
	import Icon from '../Icon.svelte';
	import Modal from './Modal.svelte';

	let { ready, onadd }: { ready: boolean; onadd: (parts: PastedPart[]) => void } = $props();

	const id = $props.id();
	let modal: Modal;
	let text = $state('');
	let reviewed = $state<
		{ line: string; heading?: string; parsed?: Ingredient; problem?: string }[] | null
	>(null);

	const pasted = $derived(reviewed?.filter((entry) => entry.parsed || entry.heading) ?? []);
	const good = $derived(reviewed?.filter((entry) => entry.parsed) ?? []);
	const failed = $derived(reviewed?.filter((entry) => entry.problem) ?? []);

	export function show() {
		text = '';
		reviewed = null;
		modal.show();
	}

	function review() {
		reviewed = text
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				if (line.endsWith(':')) return { line, heading: line.slice(0, -1).trim() };
				try {
					return { line, parsed: parseIngredientLine(line) };
				} catch (error) {
					return {
						line,
						problem: error instanceof Error ? error.message : 'This line could not be read.'
					};
				}
			});
	}

	function add() {
		const parts: PastedPart[] = [{ name: '', rows: [] }];
		for (const entry of pasted) {
			if (entry.heading !== undefined) parts.push({ name: entry.heading, rows: [] });
			else parts[parts.length - 1].rows.push(rowFromIngredient(entry.parsed!));
		}
		onadd(parts.filter((part) => part.rows.length));
		if (failed.length) {
			text = failed.map((entry) => entry.line).join('\n');
			reviewed = null;
		} else {
			modal.close();
		}
	}

	const describe = (ingredient: Ingredient) =>
		[
			ingredient.prefix,
			ingredient.amount
				? `${typeof ingredient.amount.qty === 'number' ? ingredient.amount.qty : `${ingredient.amount.qty.min}-${ingredient.amount.qty.max}`} ${ingredient.amount.unit ?? ''}`.trim()
				: '',
			ingredient.item,
			ingredient.note ? `(${ingredient.note})` : ''
		]
			.filter(Boolean)
			.join(' ');
</script>

<Modal bind:this={modal} title="Paste ingredients">
	<form onsubmit={(event) => event.preventDefault()}>
		<label for="{id}-text">One ingredient per line</label>
		<textarea
			id="{id}-text"
			class="control"
			rows="8"
			bind:value={text}
			aria-describedby="{id}-help"
			oninput={() => (reviewed = null)}
		></textarea>
		<p class="help" id="{id}-help">
			For example "200 g plain flour" or "2 tbsp olive oil, plus extra". A line ending in a colon,
			such as "For the sauce:", starts a new part. You can fix anything on the next screen.
		</p>

		{#if reviewed}
			<div class="results" aria-live="polite">
				{#if good.length}
					<h3>Ready to add ({good.length})</h3>
					<ul>
						{#each pasted as entry, n (n)}
							{#if entry.heading !== undefined}
								<li class="part">{entry.heading}</li>
							{:else}
								<li><Icon name="checkCircle" size={18} />{describe(entry.parsed!)}</li>
							{/if}
						{/each}
					</ul>
				{/if}
				{#if failed.length}
					<h3>Could not read ({failed.length})</h3>
					<ul>
						{#each failed as entry, n (n)}
							<li class="bad">
								<Icon name="xCircle" size={18} />
								<span>"{entry.line}"<br /><span class="why">{entry.problem}</span></span>
							</li>
						{/each}
					</ul>
					<p class="help">
						Adding keeps the lines above and leaves these in the box, so you can fix them and review
						again.
					</p>
				{/if}
			</div>
		{/if}

		<div class="buttons">
			<button type="button" class="btn" disabled={!ready || !text.trim()} onclick={review}>
				Review
			</button>
			<button type="button" class="btn primary" disabled={!good.length} onclick={add}>
				Add {good.length || ''}
				{good.length === 1 ? 'ingredient' : 'ingredients'}
			</button>
		</div>
	</form>
</Modal>

<style>
	form {
		display: grid;
		gap: var(--space-3);
	}

	label {
		font-weight: 700;
	}

	.results {
		display: grid;
		gap: var(--space-2);
	}

	.results ul {
		display: grid;
		gap: var(--space-2);
	}

	li {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
	}

	li :global(svg) {
		flex: none;
		margin-block-start: 0.2em;
		color: var(--colour-success);
	}

	.part {
		margin-block-start: var(--space-2);
		color: var(--colour-primary);
		font-weight: 700;
	}

	li.bad :global(svg) {
		color: var(--colour-danger);
	}

	.why {
		color: var(--colour-danger);
		font-size: var(--text-s);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		justify-content: flex-end;
	}
</style>
