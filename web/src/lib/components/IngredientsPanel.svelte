<script lang="ts">
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import type { Ticks } from '$lib/stores/ticks.svelte';
	import { unitLabel } from '$lib/recipe/format';
	import type { ScaledIngredient } from '$lib/types/recipe';
	import Icon from './Icon.svelte';
	import IngredientLine from './IngredientLine.svelte';

	let { model, ticks, hydrated }: { model: RecipeModel; ticks: Ticks; hydrated: boolean } =
		$props();

	const id = $props.id();
	const total = $derived(model.view.groups.reduce((sum, group) => sum + group.items.length, 0));
	const ready = $derived(ticks.count('i:'));
	const anyPickable = $derived(
		model.view.groups.some((group) => group.items.some((item) => model.canPick(item)))
	);

	/** The line with its amount taken out, because the amount has its own slot. */
	function wording(item: ScaledIngredient): { text: string; amount: boolean } {
		// "(optional)" becomes a tag beside the line rather than words in brackets.
		const line = item.optional ? item.text.replace(/\s*\(optional\)$/, '') : item.text;
		const amount = item.amount?.text;
		const at = amount ? line.indexOf(amount) : -1;
		if (!amount || at < 0) {
			// With no amount, "to taste" moves into the amount slot.
			const text = item.toTaste ? line.replace(/,?\s*to taste\b/i, '') : line;
			return { text: text.trim(), amount: false };
		}
		const rest = line.slice(0, at) + line.slice(at + amount.length);
		return { text: rest.replace(/\s+/g, ' ').trim(), amount: true };
	}

	/** Starts with the visible amount, so voice control can say what it sees. */
	function label(position: string, item: ScaledIngredient): string {
		const amount = model.amountText(position, item);
		const next = model.nextUnit(position, item);
		return next ? `${amount}, show in ${unitLabel(next)}` : amount;
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
			<span aria-live="polite"><span class="num">{ready} of {total}</span> ready</span>
			<button type="button" disabled={!hydrated || ready === 0} onclick={() => ticks.clear('i:')}>
				<Icon name="reset" size={16} />Reset
			</button>
		</div>
	</div>

	{#if model.ready && anyPickable && !preferences.unitHintDismissed}
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
					{@const words = wording(item)}
					{@const menu = words.amount && model.canPick(item)}
					<IngredientLine
						id="{id}-{position}"
						text={words.text}
						toTaste={item.toTaste}
						optional={item.optional}
						changed={item.scaled}
						amountText={words.amount && !menu ? item.amount?.text : undefined}
						notes={item.hint ? [item.hint] : []}
						checked={ticks.has(`i:${position}`)}
						disabled={!hydrated}
						ontoggle={() => ticks.toggle(`i:${position}`)}
						amount={menu ? unitToggle : undefined}
					/>
					{#snippet unitToggle()}
						<button
							type="button"
							class="toggle num"
							class:changed={item.scaled}
							disabled={!model.ready}
							aria-label={label(position, item)}
							onclick={() => cycle(position, item)}>{model.amountText(position, item)}</button
						>
					{/snippet}
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

	.toggle {
		margin: 0 0 0 calc(-1 * var(--space-1));
		padding: 0 var(--space-1);
		border: 0;
		border-radius: var(--radius-s);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
		text-decoration: underline dotted var(--colour-muted);
		text-underline-offset: 0.25em;
	}

	.toggle:not(:disabled):hover {
		background: var(--colour-tint);
	}

	.toggle:disabled {
		cursor: default;
		text-decoration: none;
	}

	.changed {
		color: var(--colour-primary);
	}

	@media print {
		.progress,
		.hint {
			display: none;
		}
	}
</style>
