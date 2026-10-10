<script lang="ts">
	import { clockLabel, hasEnoughTiming, parseClock, planBackwards } from '$lib/kitchen/planner';
	import { formatMinutes } from '$lib/recipe/format';
	import type { ScaledStep } from '$lib/types/recipe';

	let { steps }: { steps: ScaledStep[] } = $props();

	const id = $props.id();
	let serveAt = $state('');

	const enough = $derived(hasEnoughTiming(steps));
	const minutes = $derived(parseClock(serveAt));
	const plan = $derived(minutes === undefined ? undefined : planBackwards(steps, minutes));
</script>

{#if enough}
	<details>
		<summary>Plan backwards from…</summary>
		<div class="panel">
			<label for="{id}-time">Serve at</label>
			<input id="{id}-time" type="time" bind:value={serveAt} />
			{#if plan}
				<p class="start">
					Start by <strong class="num">{clockLabel(plan.startBy)}</strong>
				</p>
				<ol>
					{#each plan.rows as row (row.number)}
						<li>
							<span class="num at">{clockLabel(row.at)}</span>
							<span>
								Step <span class="num">{row.number}</span>{#if row.heading}: {row.heading}{/if}
								{#if row.minutes !== null}<span class="muted num"
										>({formatMinutes(row.minutes)})</span
									>{/if}
							</span>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="help">Pick the time you want to eat, and the steps are timed back from it.</p>
			{/if}
		</div>
	</details>
{/if}

<style>
	details {
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
	}

	summary {
		display: flex;
		align-items: center;
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		color: var(--colour-primary);
		font-weight: 700;
	}

	.panel {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		padding: var(--space-2) var(--space-4) var(--space-4);
	}

	label {
		font-weight: 700;
	}

	input {
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border: 1px solid var(--colour-muted);
		border-radius: var(--radius-s);
		background: var(--colour-bg);
		font-family: var(--font-num);
		font-size: var(--text-l);
	}

	input:focus-visible {
		border-color: var(--colour-primary);
	}

	.start {
		font-size: var(--text-l);
	}

	.start strong {
		color: var(--colour-accent);
	}

	ol {
		display: grid;
		gap: var(--space-1);
	}

	li {
		display: flex;
		gap: var(--space-3);
	}

	.at {
		min-inline-size: 5ch;
		color: var(--colour-primary);
	}

	.muted,
	.help {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	@media print {
		details {
			display: none;
		}
	}
</style>
