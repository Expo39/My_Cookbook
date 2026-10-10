<script lang="ts">
	import { unlockAudio } from '$lib/kitchen/alert';
	import { clockText } from '$lib/kitchen/timer-math';
	import { timers } from '$lib/stores/timers.svelte';
	import Icon from './Icon.svelte';

	let { id, name, minutes, text }: { id: string; name: string; minutes: number; text: string } =
		$props();

	const timer = $derived(timers.get(id));
	const status = $derived(timer ? timers.status(timer) : undefined);

	function press() {
		if (timer) {
			const pill = [...document.querySelectorAll<HTMLElement>('[data-timer]')].find(
				(element) => element.dataset.timer === id
			);
			pill?.querySelector('button')?.focus();
			return;
		}
		unlockAudio();
		timers.start({ id, name, minutes });
	}
</script>

<button
	type="button"
	class="timer num"
	class:running={status === 'running'}
	class:paused={status === 'paused'}
	class:finished={status === 'finished'}
	aria-label={timer ? `Show the ${name} timer` : `Start ${text} timer, ${name}`}
	onclick={press}
>
	<Icon name="timer" size={14} />
	{#if !timer}{text}{:else if status === 'finished'}Done{:else}{clockText(
			timers.remaining(timer)
		)}{/if}
</button>

<style>
	.timer {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0 var(--space-2);
		border: 1px solid var(--colour-accent);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--colour-accent);
		font-size: 0.88em;
		font-weight: 700;
		line-height: 1.5;
		white-space: nowrap;
		transition:
			background-color var(--duration-micro),
			color var(--duration-micro);
	}

	/* The pill stays inline with the text; this widens the area a thumb can hit. */
	.timer::after {
		content: '';
		position: absolute;
		inset: -0.6rem -0.3rem;
	}

	.timer:hover,
	.running,
	.finished {
		background: var(--colour-accent);
		color: var(--colour-on-primary);
	}

	.paused {
		border-style: dashed;
	}

	.finished {
		animation: pulse 900ms ease-out 3;
	}

	@keyframes pulse {
		from {
			box-shadow: 0 0 0 0 var(--colour-accent);
		}
		to {
			box-shadow: 0 0 0 0.6rem transparent;
		}
	}

	@media print {
		.timer {
			padding: 0;
			border: 0;
			color: inherit;
		}

		.timer :global(svg) {
			display: none;
		}
	}
</style>
