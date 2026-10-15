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
		/** An interactive amount, such as a unit menu; it wins over `amountText`. */
		amount?: Snippet;
		amountText?: string;
		/** Shows "to taste" in the amount slot when there is no amount. */
		toTaste?: boolean;
		/** Adds an "optional" tag after the name. */
		optional?: boolean;
		/**
		 * The shopping list's layout: the name first, from the left edge, and the quantity after it in a
		 * pill, so a line with no quantity simply has no pill.
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
			{#if amountText || toTaste}
				<span class="pill num" class:taste={!amountText}>{amountText || 'to taste'}</span>
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

	/* Sea blue with white text in light mode; the dark theme's primary makes it light blue on navy. */
	.pill {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-size: var(--text-s);
		white-space: nowrap;
	}

	.pill.taste {
		background: var(--colour-tint);
		color: var(--colour-muted);
		font-family: var(--font-body);
		font-style: italic;
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

	.done .amount,
	.done label {
		color: var(--colour-muted);
		text-decoration: line-through;
		opacity: 0.7;
	}

	.done .pill {
		opacity: 0.5;
		text-decoration: line-through;
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
