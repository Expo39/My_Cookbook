<script lang="ts">
	import { stepTimers } from '$lib/kitchen/timer-ids';
	import { splitAmount } from '$lib/recipe/format';
	import type { ScaledStep } from '$lib/types/recipe';
	import Timer from './Timer.svelte';

	let {
		step,
		recipe,
		number
	}: { step: ScaledStep; recipe: { id: string; title: string }; number: number } = $props();

	/** Each segment, with the timer it starts when it is one. */
	const parts = $derived.by(() => {
		const specs = stepTimers(recipe, number, step.segments);
		let next = 0;
		return step.segments.map((segment) => ({
			segment,
			timer: segment.type === 'timer' ? specs[next++] : undefined
		}));
	});
</script>

<p>
	{#each parts as { segment, timer }, k (k)}
		{#if segment.type === 'text'}{segment.text}{:else if segment.type === 'ingredient'}{@const [
				before,
				amount,
				after
			] = splitAmount(segment.text)}<strong class="ref"
				>{before}{#if amount}<span class="num">{amount}</span>{/if}{after}</strong
			>{:else if segment.type === 'temp'}<span
				class="temp num"
				title={segment.gasMark && !segment.internal ? `Gas mark ${segment.gasMark}` : undefined}
				>{segment.text}{#if segment.gasMark && !segment.internal}<span class="sr-only">
						(gas mark {segment.gasMark})</span
					>{/if}</span
			>{:else if timer}<Timer {...timer} />{/if}
	{/each}
</p>

<style>
	.ref {
		color: var(--colour-primary);
		font-weight: 700;
	}

	.temp {
		white-space: nowrap;
	}
</style>
