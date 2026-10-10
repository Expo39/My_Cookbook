<script lang="ts">
	import { clockText } from '$lib/kitchen/timer-math';
	import { timers } from '$lib/stores/timers.svelte';
	import Icon from './Icon.svelte';
</script>

<div class="sr-only" role="status">{timers.announcement}</div>

{#if timers.list.length}
	<section class="strip" aria-label="Timers">
		<ul>
			{#each timers.list as timer (timer.id)}
				{@const status = timers.status(timer)}
				<li
					class="pill"
					class:finished={status === 'finished'}
					class:paused={status === 'paused'}
					data-timer={timer.id}
				>
					<span class="name">{timer.name}</span>
					<span class="num time"
						>{status === 'finished' ? 'Done' : clockText(timers.remaining(timer))}</span
					>
					{#if status === 'running'}
						<button
							type="button"
							aria-label="Pause {timer.name}"
							onclick={() => timers.pause(timer.id)}
						>
							<Icon name="pause" size={18} />
						</button>
					{:else if status === 'paused'}
						<button
							type="button"
							aria-label="Resume {timer.name}"
							onclick={() => timers.resume(timer.id)}
						>
							<Icon name="play" size={18} />
						</button>
					{/if}
					<button
						type="button"
						class="more num"
						aria-label="Add one minute to {timer.name}"
						onclick={() => timers.addMinute(timer.id)}>+1</button
					>
					<button
						type="button"
						aria-label="Dismiss {timer.name}"
						onclick={() => timers.dismiss(timer.id)}
					>
						<Icon name="x" size={18} />
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.strip {
		position: sticky;
		inset-block-start: 0;
		z-index: 20;
		padding: var(--space-2) var(--gutter);
		border-block-end: 1px solid var(--colour-line);
		background: var(--colour-surface);
		box-shadow: var(--shadow-float);
	}

	ul {
		display: flex;
		gap: var(--space-2);
		max-inline-size: var(--page-max);
		margin-inline: auto;
		padding: var(--space-1);
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
	}

	.pill {
		display: flex;
		flex: none;
		align-items: center;
		gap: var(--space-1);
		padding-inline: var(--space-4) var(--space-1);
		border: 1px solid var(--colour-accent);
		border-radius: var(--radius-pill);
		color: var(--colour-accent);
		scroll-snap-align: start;
	}

	.name {
		margin-inline-end: var(--space-1);
		max-inline-size: 10rem;
		overflow: hidden;
		font-size: var(--text-s);
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.time {
		min-inline-size: 3.5ch;
		font-size: var(--text-l);
		text-align: end;
	}

	.paused {
		border-style: dashed;
	}

	.finished {
		background: var(--colour-accent);
		color: var(--colour-on-primary);
		animation: pulse 900ms ease-out 6;
	}

	@keyframes pulse {
		from {
			box-shadow: 0 0 0 0 var(--colour-accent);
		}
		to {
			box-shadow: 0 0 0 0.6rem transparent;
		}
	}

	button {
		display: grid;
		place-items: center;
		min-inline-size: var(--target);
		block-size: var(--target);
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: inherit;
		font-size: var(--text-s);
		font-weight: 700;
	}

	button:hover {
		background: var(--colour-tint);
	}

	.finished button:hover {
		color: var(--colour-accent);
		background: var(--colour-on-primary);
	}

	.finished :focus-visible {
		outline-color: var(--colour-on-primary);
	}

	@media print {
		.strip {
			display: none;
		}
	}
</style>
