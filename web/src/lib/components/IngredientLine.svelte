<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		text,
		amount,
		amountText,
		toTaste = false,
		optional = false,
		flush = false,
		changed = false,
		notes = [],
		checked,
		disabled = false,
		ontoggle
	}: {
		/** The checkbox id, which the label points at. */
		id: string;
		/** The line without its amount, e.g. "casarecce or short pasta". */
		text: string;
		/** An interactive amount, such as a unit toggle or a quantity editor; it wins over `amountText`. */
		amount?: Snippet;
		amountText?: string;
		/** Shows "to taste" in the amount slot when there is no amount. */
		toTaste?: boolean;
		/** Adds an "optional" tag after the name. */
		optional?: boolean;
		/**
		 * The shopping list's layout: the name first, from the left edge, and the quantity on the right,
		 * so a line with no quantity simply has nothing there.
		 */
		flush?: boolean;
		changed?: boolean;
		/** Smaller lines under the ingredient, such as hints or where it came from. */
		notes?: string[];
		checked: boolean;
		disabled?: boolean;
		ontoggle: () => void;
	} = $props();

	const shown = $derived(notes.filter(Boolean));
</script>

<li class:done={checked}>
	<input {id} type="checkbox" {checked} {disabled} onchange={ontoggle} />
	<div class="line" class:flush>
		{#if flush}
			<label for={id}
				>{text}{#if optional}<span class="optional">optional</span>{/if}</label
			>
			{#if amount}
				{@render amount()}
			{:else if amountText || toTaste}
				<span class="qty" class:taste={!amountText}>{amountText || 'to taste'}</span>
			{/if}
		{:else}
			<span class="amount num" class:changed class:taste={!amount && !amountText && toTaste}
				>{#if amount}{@render amount()}{:else if amountText}{amountText}{:else if toTaste}to taste{/if}</span
			>
			<label for={id}
				>{text}{#if optional}<span class="optional">optional</span>{/if}</label
			>
		{/if}
		{#each shown as note (note)}
			<span class="note">{note}</span>
		{/each}
	</div>
</li>

<style>
	/*
	 * Everything is left aligned. The amount slot has a fixed minimum width, so the ingredient names
	 * line up whether or not a line has an amount, and a long name wraps back under the amount.
	 */
	li {
		display: grid;
		grid-template-columns: var(--target) 1fr;
		align-items: start;
		border-block-end: 1px dashed var(--colour-line);
		transition: color var(--duration-micro);
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

	input:disabled {
		cursor: default;
	}

	.line {
		padding-block: calc((var(--target) - 1.6em) / 2);
	}

	.amount {
		display: inline-block;
		min-inline-size: var(--amount-slot);
		margin-inline-end: var(--space-2);
		color: var(--colour-ink);
	}

	/* An empty inline block has no baseline of its own; a zero-width space keeps the line in step. */
	.amount:empty::before {
		content: '\200b';
	}

	.changed {
		color: var(--colour-primary);
	}

	.flush {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: var(--space-3);
	}

	.flush label {
		flex: 1;
	}

	.flush .note {
		flex-basis: 100%;
	}

	/* A right-hand column of quantities, like a written list: quiet, and quick to scan. */
	.qty {
		color: var(--colour-primary);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		white-space: nowrap;
	}

	.qty.taste {
		color: var(--colour-muted);
		font-family: var(--font-body);
		font-size: var(--text-s);
		font-style: italic;
		font-weight: 400;
	}

	.taste {
		color: var(--colour-muted);
		font-family: var(--font-body);
		font-size: var(--text-s);
		font-style: italic;
		font-weight: 400;
	}

	label {
		cursor: pointer;
	}

	.optional {
		display: inline-block;
		margin-inline-start: var(--space-2);
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
		color: var(--colour-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-decoration: none;
		vertical-align: 0.1em;
	}

	.note {
		display: block;
		color: var(--colour-muted);
		font-size: var(--text-s);
		font-style: italic;
	}

	/* A ticked line is done as a whole: everything on it fades, and the name is struck through. */
	.line {
		transition: opacity var(--duration-panel) var(--ease-out);
	}

	.done .line {
		opacity: 0.5;
	}

	.done label {
		text-decoration: line-through;
		text-decoration-color: var(--colour-muted);
	}

	.done .amount,
	.done .qty,
	.done .line :global(button) {
		color: var(--colour-muted);
		background: transparent;
	}

	.done .line :global(button::before) {
		background: transparent;
	}

	@media (prefers-reduced-motion: no-preference) {
		input:checked::before {
			animation: pop var(--duration-panel) var(--ease-out);
		}
	}

	@keyframes pop {
		50% {
			transform: translate(-50%, -50%) scale(1.15);
		}
	}

	@media print {
		li {
			grid-template-columns: 1fr;
			break-inside: avoid;
		}

		input {
			display: none;
		}

		.line {
			padding-block: 0;
		}
	}
</style>
