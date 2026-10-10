<script lang="ts">
	import Icon from './Icon.svelte';

	let { minutes, text, name }: { minutes: number; text: string; name?: string | null } = $props();

	let endAt = $state<number | null>(null);
	let now = $state(0);

	const remaining = $derived(endAt === null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000)));
	const finished = $derived(endAt !== null && remaining === 0);
	const running = $derived(endAt !== null && !finished);
	const subject = $derived(name ? `${name} timer` : 'timer');

	$effect(() => {
		if (!running) return;
		const tick = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(tick);
	});

	function toggle() {
		if (endAt !== null) {
			endAt = null;
			return;
		}
		now = Date.now();
		endAt = now + minutes * 60_000;
	}

	function clock(seconds: number): string {
		const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
		const pad = (n: number) => String(n).padStart(2, '0');
		return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
	}
</script>

<button
	type="button"
	class="timer num"
	class:running
	class:finished
	aria-label={endAt === null ? `Start ${text} ${subject}` : `Stop the ${subject}`}
	onclick={toggle}
>
	<Icon name="timer" size={14} />
	{#if endAt === null}{text}{:else if finished}Done{:else}{clock(remaining)}{/if}
</button><span class="sr-only" role="status">{finished ? `The ${subject} has finished.` : ''}</span>

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
	.running {
		background: var(--colour-accent);
		color: var(--colour-on-primary);
	}

	.finished {
		animation: pulse 900ms ease-out 3;
		background: var(--colour-accent);
		color: var(--colour-on-primary);
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
