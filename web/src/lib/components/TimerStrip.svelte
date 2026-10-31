<script lang="ts">
	import { clockText } from '$lib/kitchen/timer-math';
	import { timers } from '$lib/stores/timers.svelte';
	import Icon from './Icon.svelte';

	let expanded = $state(false);

	/** Finished timers first, then whichever ends soonest: on a phone only the first is shown folded. */
	const ordered = $derived(
		[...timers.list].sort((a, b) => {
			const rank = (t: (typeof timers.list)[number]) =>
				timers.status(t) === 'finished' ? -1 : timers.remaining(t);
			return rank(a) - rank(b);
		})
	);
	const more = $derived(ordered.length - 1);
	$effect(() => {
		if (more < 1) expanded = false;
	});
</script>

<div class="sr-only" role="status">{timers.announcement}</div>

{#if timers.list.length}
	<section class="strip" class:expanded aria-label="Timers">
		<ul id="timer-list">
			{#each ordered as timer (timer.id)}
				{@const status = timers.status(timer)}
				<li
					class="pill"
					class:finished={status === 'finished'}
					class:paused={status === 'paused'}
					data-timer={timer.id}
				>
					<span class="name" title={timer.name}>{timer.name}</span>
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
		{#if more > 0}
			<button
				type="button"
				class="more-timers"
				aria-expanded={expanded}
				aria-controls="timer-list"
				onclick={() => (expanded = !expanded)}
				>{#if expanded}Show fewer{:else}<span class="num">+{more}</span>
					{more === 1 ? 'timer' : 'timers'}{/if}</button
			>
		{/if}
	</section>
{:else if !timers.loaded}
	<!-- Shown only when the script in app.html knows a timer is running: a strip as tall as one pill. -->
	<section class="strip waiting" aria-hidden="true" inert>
		<ul>
			<li class="pill">
				<span class="name">Timer</span>
				<span class="num time">0:00</span>
				<button type="button"><Icon name="pause" size={18} /></button>
			</li>
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

	/* Without a running timer (known to the script in app.html) the held place is not drawn. */
	:global(html:not([data-timers])) .waiting {
		display: none;
	}

	.waiting .pill {
		visibility: hidden;
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

	/* Names wrap rather than being cut short, so a cook can always tell which timer is which. */
	.name {
		margin-inline-end: var(--space-1);
		max-inline-size: 14rem;
		padding-block: var(--space-1);
		font-size: var(--text-s);
		font-weight: 700;
		line-height: 1.3;
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

	.more-timers {
		display: none;
	}

	/*
	 * A phone shows one full-width timer, the one that ends soonest, with a button for the rest. Opened,
	 * every timer gets its own row, so nothing scrolls sideways.
	 */
	@media (max-width: 39.99rem) {
		.strip {
			display: grid;
			gap: var(--space-2);
		}

		ul {
			display: grid;
			padding: 0;
			overflow: visible;
		}

		.pill {
			display: grid;
			align-items: center;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-auto-columns: var(--target);
			grid-auto-flow: column;
			padding-inline: var(--space-3) 0;
			border-radius: var(--radius-m);
		}

		.name {
			max-inline-size: none;
		}

		.strip:not(.expanded) .pill:not(:first-child) {
			display: none;
		}

		.more-timers {
			display: inline-flex;
			align-items: center;
			justify-self: start;
			gap: var(--space-1);
			min-inline-size: auto;
			padding-inline: var(--space-3);
			border: 1px solid var(--colour-line);
			color: var(--colour-accent);
		}
	}

	@media print {
		.strip {
			display: none;
		}
	}
</style>
