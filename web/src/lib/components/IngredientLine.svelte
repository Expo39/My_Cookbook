<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		text,
		amount,
		amountText,
		toTaste = false,
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
	<div class="line">
		<span class="amount num" class:changed class:taste={!amount && !amountText && toTaste}
			>{#if amount}{@render amount()}{:else if amountText}{amountText}{:else if toTaste}to taste{/if}</span
		>
		<label for={id}>{text}</label>
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

	.changed {
		color: var(--colour-primary);
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
