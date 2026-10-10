<script lang="ts">
	import { unitLabel } from '$lib/recipe/format';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import type { Ticks } from '$lib/stores/ticks.svelte';
	import type { ScaledIngredient } from '$lib/types/recipe';
	import Icon from './Icon.svelte';

	let { model, ticks, hydrated }: { model: RecipeModel; ticks: Ticks; hydrated: boolean } =
		$props();

	const id = $props.id();
	const total = $derived(model.view.groups.reduce((sum, group) => sum + group.items.length, 0));
	const ready = $derived(ticks.count('i:'));
	const anyToggleable = $derived(
		model.view.groups.some((group) => group.items.some((item) => model.canCycle(item)))
	);

	/** The line with its amount taken out, because the amount has its own column. */
	function wording(item: ScaledIngredient): string | undefined {
		const amount = item.amount?.text;
		const at = amount ? item.text.indexOf(amount) : -1;
		if (!amount || at < 0) return undefined;
		return (item.text.slice(0, at) + item.text.slice(at + amount.length))
			.replace(/\s+/g, ' ')
			.trim();
	}

	function label(position: string, item: ScaledIngredient): string {
		if (!model.ready) return 'Change unit';
		const next = model.nextUnit(position, item);
		return next ? `Show in ${unitLabel(next)}` : 'Change unit';
	}

	function cycle(position: string, item: ScaledIngredient) {
		model.cycleUnit(position, item);
		preferences.dismissUnitHint();
	}
</script>

<section aria-labelledby="{id}-title">
	<div class="head">
		<h2 id="{id}-title">Ingredients</h2>
		<div class="progress">
			<span class="num" aria-live="polite">{ready} of {total}</span> ready
			<button type="button" disabled={!hydrated || ready === 0} onclick={() => ticks.clear('i:')}>
				<Icon name="reset" size={16} />Reset
			</button>
		</div>
	</div>

	{#if model.ready && anyToggleable && !preferences.unitHintDismissed}
		<p class="hint">
			<Icon name="info" size={18} />
			<span>Tap an amount to change its unit</span>
			<button
				type="button"
				aria-label="Dismiss the hint"
				onclick={() => preferences.dismissUnitHint()}
			>
				<Icon name="x" size={18} />
			</button>
		</p>
	{/if}

	{#each model.view.groups as group, g (g)}
		<div class="group">
			{#if group.name || group.total}
				<h3 class="label">
					{group.name ?? ''}{#if group.total}
						<span class="num total">{group.total.text} total</span>{/if}
				</h3>
			{/if}
			<ul>
				{#each group.items as item, i (i)}
					{@const position = `${g}.${i}`}
					{@const done = ticks.has(`i:${position}`)}
					{@const rest = wording(item)}
					<li class:done>
						<input
							id="{id}-{position}"
							type="checkbox"
							checked={done}
							disabled={!hydrated}
							onchange={() => ticks.toggle(`i:${position}`)}
						/>
						{#if rest !== undefined && item.amount}
							{#if model.canCycle(item)}
								<button
									type="button"
									class="amount num"
									class:changed={item.scaled}
									disabled={!model.ready}
									aria-label={label(position, item)}
									onclick={() => cycle(position, item)}>{model.amountText(position, item)}</button
								>
							{:else}
								<span class="amount num" class:changed={item.scaled}>{item.amount.text}</span>
							{/if}
						{/if}
						<label for="{id}-{position}" class:wide={rest === undefined}>
							{rest ?? item.text}
							{#if item.hint}<span class="note">{item.hint}</span>{/if}
						</label>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</section>

<style>
	section {
		display: grid;
		gap: var(--space-3);
		align-content: start;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
	}

	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.progress button,
	.hint button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--target);
		min-inline-size: var(--target);
		justify-content: center;
		padding-inline: var(--space-2);
		border: 0;
		background: transparent;
		color: var(--colour-primary);
		font-weight: 700;
	}

	.progress button:disabled {
		color: var(--colour-muted);
		opacity: 0.6;
	}

	.hint {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-inline-start: var(--space-3);
		border: 1px dashed var(--colour-line);
		border-radius: var(--radius-s);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.hint span {
		flex: 1;
	}

	.group {
		display: grid;
		gap: var(--space-1);
	}

	h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		color: var(--colour-primary);
		font-family: var(--font-body);
		letter-spacing: 0.08em;
	}

	.total {
		color: var(--colour-muted);
		font-size: var(--text-s);
		letter-spacing: 0;
		text-transform: none;
	}

	li {
		display: grid;
		grid-template-columns: var(--target) 5.5rem 1fr;
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

	.amount {
		min-block-size: var(--target);
		padding: 0 var(--space-2) 0 0;
		border: 0;
		background: transparent;
		color: var(--colour-ink);
		line-height: var(--target);
		text-align: end;
	}

	button.amount {
		border-radius: var(--radius-s);
		text-decoration: underline dotted var(--colour-muted);
		text-underline-offset: 0.25em;
	}

	button.amount:disabled {
		cursor: default;
		text-decoration: none;
	}

	button.amount:not(:disabled):hover {
		background: var(--colour-tint);
	}

	.changed {
		color: var(--colour-primary);
	}

	label {
		display: grid;
		gap: var(--space-1);
		padding-block: calc((var(--target) - 1.6em) / 2);
		cursor: pointer;
	}

	.wide {
		grid-column: 2 / -1;
	}

	.note {
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
		.progress,
		.hint {
			display: none;
		}

		li {
			grid-template-columns: 4.5rem 1fr;
			break-inside: avoid;
		}

		input {
			display: none;
		}

		.amount {
			min-block-size: 0;
			line-height: inherit;
		}

		label {
			padding-block: 0;
		}

		button.amount {
			text-decoration: none;
		}
	}
</style>
