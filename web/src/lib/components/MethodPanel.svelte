<script lang="ts">
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { stepTick, type Ticks } from '$lib/stores/ticks.svelte';
	import type { ScaledStep } from '$lib/types/recipe';
	import Hint from './Hint.svelte';
	import Icon from './Icon.svelte';
	import StepText from './StepText.svelte';

	let {
		model,
		ticks,
		hydrated,
		recipe
	}: {
		model: RecipeModel;
		ticks: Ticks;
		hydrated: boolean;
		recipe: { id: string; title: string };
	} = $props();

	const id = $props.id();
	const steps = $derived(model.view.steps);
	/** Each step's tick, from the step as written, since the shown text changes with the servings. */
	const tickOf = (step: ScaledStep, number: number) =>
		stepTick({
			key: step.key,
			text: model.data.recipe.steps[number - 1]?.text ?? step.text
		});
	const done = $derived(ticks.countOf(steps.map((step, i) => tickOf(step, i + 1))));
	/** Until the cook has found it, the number circles say they can be tapped. */
	const showHint = $derived(!preferences.stepHintDismissed && done === 0);

	function toggle(tick: string) {
		ticks.toggle(tick);
		preferences.dismissStepHint();
	}

	interface Stage {
		heading?: string | null;
		steps: { step: ScaledStep; number: number }[];
	}

	/** A heading starts a new stage; steps before the first heading form an untitled one. */
	const stages = $derived.by(() => {
		const result: Stage[] = [];
		steps.forEach((step, position) => {
			if (step.heading || result.length === 0) result.push({ heading: step.heading, steps: [] });
			result[result.length - 1].steps.push({ step, number: position + 1 });
		});
		return result;
	});
</script>

<section aria-labelledby="{id}-title">
	<div class="head">
		<h2 id="{id}-title">Method</h2>
		<div class="progress">
			<span aria-live="polite"><span class="num">{done} of {steps.length}</span> done</span>
			<button type="button" disabled={!hydrated || done === 0} onclick={() => ticks.clear('s:')}>
				<Icon name="reset" size={16} />Reset
			</button>
		</div>
	</div>

	{#if showHint}
		<Hint
			name="steps"
			text="Tap a step's number to mark it done"
			ondismiss={() => preferences.dismissStepHint()}
		/>
	{/if}

	{#each stages as stage, s (s)}
		<div class="stage">
			{#if stage.heading}<h3>{stage.heading}</h3>{/if}
			<ol>
				{#each stage.steps as { step, number } (number)}
					{@const tick = tickOf(step, number)}
					{@const ticked = ticks.has(tick)}
					<li class:ticked class:beckon={showHint && number === 1}>
						<input
							type="checkbox"
							class="num"
							data-number={number}
							aria-label="Mark step {number} as done"
							checked={ticked}
							disabled={!hydrated}
							onchange={() => toggle(tick)}
						/>
						<div class="body">
							<StepText {step} {recipe} {number} />
							{#if step.hint}
								<p class="hint"><Icon name="alert" size={16} />{step.hint}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		</div>
	{/each}
</section>

<style>
	section {
		display: grid;
		gap: var(--space-4);
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

	.progress button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--target);
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

	.stage {
		display: grid;
		gap: var(--space-3);
	}

	.stage h3 {
		padding-block-end: var(--space-1);
		border-block-end: 2px solid var(--colour-line);
	}

	ol {
		display: grid;
		gap: var(--space-2);
	}

	li {
		display: grid;
		grid-template-columns: var(--target) 1fr;
		gap: var(--space-3);
		max-inline-size: var(--measure);
		transition: opacity var(--duration-panel);
	}

	.ticked {
		opacity: 0.6;
	}

	input {
		appearance: none;
		position: relative;
		inline-size: var(--target);
		block-size: var(--target);
		margin: 0;
	}

	input::before,
	input::after {
		position: absolute;
		inset: 0;
		margin: auto;
	}

	input::before {
		content: '';
		inline-size: 2rem;
		block-size: 2rem;
		border: 2px solid var(--colour-primary);
		border-radius: var(--radius-pill);
		transition: background-color var(--duration-micro);
	}

	input::after {
		content: attr(data-number);
		block-size: 2rem;
		color: var(--colour-primary);
		line-height: 2rem;
		text-align: center;
	}

	input:checked::before {
		background: var(--colour-primary);
	}

	/* The first circle breathes a few times, so a new cook sees the numbers can be tapped. */
	.beckon input::before {
		animation: beckon 1.6s var(--ease-out) 0.8s 3;
	}

	@keyframes beckon {
		50% {
			box-shadow: 0 0 0 0.4rem var(--colour-tint);
		}
	}

	/* A tick drawn as the corner of a box: centred, then lifted by the part that hangs below. */
	input:checked::after {
		content: '';
		inline-size: 0.4rem;
		block-size: 0.75rem;
		border: solid var(--colour-on-primary);
		border-width: 0 2.5px 2.5px 0;
		transform: translateY(-0.1rem) rotate(45deg);
	}

	input:disabled {
		cursor: default;
	}

	.body {
		display: grid;
		gap: var(--space-1);
		padding-block: calc((var(--target) - 1.6em) / 2);
	}

	.hint {
		display: flex;
		align-items: start;
		gap: var(--space-2);
		color: var(--colour-warning);
		font-size: var(--text-s);
	}

	.hint :global(svg) {
		flex: none;
		margin-block-start: 0.2rem;
	}

	@media print {
		.progress,
		.hint {
			display: none;
		}

		li {
			grid-template-columns: 2rem 1fr;
			break-inside: avoid;
			opacity: 1;
		}

		input {
			block-size: auto;
		}

		input::before {
			display: none;
		}

		input::after {
			position: static;
			margin: 0;
			color: var(--colour-ink);
			text-align: start;
		}

		.body {
			padding-block: 0;
		}
	}
</style>
