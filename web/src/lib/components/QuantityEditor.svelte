<script lang="ts">
	import { tick } from 'svelte';
	import { unitLabel } from '$lib/recipe/format';
	import type { Unit } from '$lib/types/recipe';
	import Icon from './Icon.svelte';

	let {
		label,
		shown,
		original,
		edited,
		value,
		unit,
		disabled = false,
		onset,
		onreset
	}: {
		/** The ingredient, for the controls' names. */
		label: string;
		/** The quantity as shown now, or empty when there is none. */
		shown: string;
		/** What the recipes add up to, or empty when they give no quantity. */
		original: string;
		edited: boolean;
		/** The number the editor starts from. */
		value: number | undefined;
		unit: Unit | null;
		/** A ticked line is bought: its quantity is settled. */
		disabled?: boolean;
		onset: (qty: number) => void;
		onreset: () => void;
	} = $props();

	const id = $props.id();
	let open = $state(false);
	let draft = $state('');
	let field: HTMLInputElement | undefined = $state();

	/** A step a shopper would actually buy in: tens of grams, half spoons, whole items. */
	const step = $derived.by(() => {
		const current = Number(draft) || value || 0;
		switch (unit) {
			case 'g':
			case 'ml':
				return current >= 200 ? 50 : 10;
			case 'kg':
			case 'l':
			case 'lb':
			case 'cup':
				return 0.25;
			case 'tsp':
			case 'tbsp':
			case 'floz':
			case 'oz':
				return 0.5;
			default:
				return 1;
		}
	});

	async function show() {
		draft = value === undefined ? '' : String(Math.round(value * 100) / 100);
		open = true;
		await tick();
		field?.select();
	}

	function nudge(direction: 1 | -1) {
		const next = Math.max(0, (Number(draft) || 0) + direction * step);
		draft = String(Math.round(next * 100) / 100);
	}

	function done(event?: SubmitEvent) {
		event?.preventDefault();
		const qty = Number(draft);
		if (draft.trim() !== '' && Number.isFinite(qty) && qty > 0) onset(qty);
		open = false;
	}

	function reset() {
		onreset();
		open = false;
	}
</script>

<button
	type="button"
	class="qty"
	class:edited
	class:empty={!shown}
	{disabled}
	aria-expanded={open}
	aria-controls="{id}-editor"
	aria-label={shown ? `${label}: ${shown}, change the amount` : `${label}: add an amount`}
	onclick={() => (open ? done() : show())}
	>{#if shown}{shown}{:else}<Icon name="plus" size={14} />amount{/if}</button
>

{#if open && !disabled}
	<form id="{id}-editor" class="editor" onsubmit={done}>
		<button type="button" class="round" aria-label="Less {label}" onclick={() => nudge(-1)}>
			<Icon name="minus" size={18} />
		</button>
		<label class="sr-only" for="{id}-qty">Amount of {label}</label>
		<span class="field">
			<input
				bind:this={field}
				id="{id}-qty"
				type="text"
				inputmode="decimal"
				autocomplete="off"
				bind:value={draft}
				onkeydown={(event) => event.key === 'Escape' && (open = false)}
			/>
			{#if unit}<span class="unit">{unitLabel(unit)}</span>{/if}
		</span>
		<button type="button" class="round" aria-label="More {label}" onclick={() => nudge(1)}>
			<Icon name="plus" size={18} />
		</button>
		<button type="submit" class="done" aria-label="Done"><Icon name="check" size={20} /></button>
		{#if edited}
			<button type="button" class="back" onclick={reset}>
				<Icon name="reset" size={14} />Back to {original || 'no amount'}
			</button>
		{/if}
	</form>
{/if}

<style>
	.qty {
		position: relative;
		z-index: 0;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--target);
		padding-inline: var(--space-2);
		margin-block: calc((1.6em - var(--target)) / 2);
		border: 0;
		border-radius: var(--radius-s);
		background: transparent;
		color: var(--colour-primary);
		font: inherit;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		white-space: nowrap;
	}

	/* The amount sits on a soft chip, so it reads as something to tap without underlining it. */
	.qty::before {
		content: '';
		position: absolute;
		inset: 50% 0 auto;
		z-index: -1;
		block-size: 1.75rem;
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		transform: translateY(-50%);
		transition: background-color var(--duration-micro);
	}

	.qty:disabled {
		cursor: default;
	}

	.qty:not(:disabled):hover::before,
	.qty[aria-expanded='true']::before {
		background: var(--colour-line);
	}

	/* A changed amount takes the accent, so it is plain the list no longer matches the recipes. */
	.edited {
		color: var(--colour-accent);
	}

	.empty {
		color: var(--colour-muted);
		font-size: var(--text-s);
		font-weight: 400;
	}

	.empty::before {
		border: 1px dashed var(--colour-line);
		background: transparent;
	}

	/* One calm row: less, the amount, more, done. Going back to the recipes' amount sits beneath. */
	.editor {
		display: flex;
		flex-wrap: wrap;
		flex-basis: 100%;
		align-items: center;
		gap: var(--space-2);
		margin-block-start: var(--space-2);
	}

	.round,
	.done {
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		padding: 0;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-pill);
		background: var(--colour-surface);
		color: var(--colour-primary);
	}

	.done {
		margin-inline-start: auto;
		border-color: var(--colour-primary);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	.field {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-1);
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border-block-end: 2px solid var(--colour-primary);
	}

	input {
		inline-size: 3.5rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-ink);
		font-size: var(--text-l);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		line-height: var(--target);
		text-align: center;
	}

	input:focus-visible {
		outline: none;
	}

	.field:focus-within {
		border-block-end-color: var(--colour-accent);
	}

	.unit {
		color: var(--colour-muted);
		font-weight: 700;
	}

	.back {
		display: inline-flex;
		flex-basis: 100%;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-primary);
		font-size: var(--text-s);
		font-weight: 700;
		text-align: start;
	}
</style>
