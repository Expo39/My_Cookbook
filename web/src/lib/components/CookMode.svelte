<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { unlockAudio } from '$lib/kitchen/alert';
	import { stepTimers } from '$lib/kitchen/timer-ids';
	import { ScreenAwake } from '$lib/kitchen/wake-lock';
	import { splitAmount } from '$lib/recipe/format';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { timers } from '$lib/stores/timers.svelte';
	import Icon from './Icon.svelte';
	import StepText from './StepText.svelte';
	import TimerStrip from './TimerStrip.svelte';

	let {
		model,
		recipe,
		step,
		onstep,
		onexit
	}: {
		model: RecipeModel;
		recipe: { id: string; title: string };
		step: number;
		onstep: (step: number) => void;
		/** Told where focus should return to, which the page restores once any navigation has settled. */
		onexit: (opener: HTMLElement | null) => void;
	} = $props();

	const id = $props.id();
	const prefersDark = new MediaQuery('prefers-color-scheme: dark');
	const SWIPE = 60;

	let dialog: HTMLDialogElement;
	let awake = $state(true);
	let swipe: { x: number; y: number } | undefined;
	let opener: HTMLElement | null = null;

	const steps = $derived(model.view.steps);
	const total = $derived(steps.length);
	const current = $derived(steps[step - 1]);
	const stage = $derived(steps.slice(0, step).findLast((entry) => entry.heading)?.heading);
	const dark = $derived(
		theme.choice === 'dark' || (theme.choice === 'system' && prefersDark.current)
	);
	const used = $derived(
		current.segments.filter(
			(segment, at, all) =>
				segment.type === 'ingredient' &&
				all.findIndex((other) => other.type === 'ingredient' && other.text === segment.text) === at
		)
	);
	const usedKeys = $derived(
		used.flatMap((segment) => (segment.type === 'ingredient' ? [segment.key] : []))
	);

	onMount(() => {
		const active = document.activeElement;
		opener = active instanceof HTMLElement && active !== document.body ? active : null;
		const awakeLock = new ScreenAwake((available) => (awake = available));
		chrome.cooking = true;
		dialog.showModal();
		awakeLock.start();
		return () => {
			awakeLock.stop();
			chrome.cooking = false;
			if (dialog.open) dialog.close();
			const target = opener?.isConnected ? opener : document.getElementById('main');
			queueMicrotask(() => target?.focus());
		};
	});

	const previous = () => step > 1 && onstep(step - 1);
	const next = () => (step < total ? onstep(step + 1) : dialog.close());

	/** The dialog keeps the rest of the page inert; this also stops Tab leaving for the browser's own controls. */
	function wrapTab(event: KeyboardEvent) {
		const focusable = [
			...dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), a[href], input, select, textarea'
			)
		].filter((element) => element.getClientRects().length > 0);
		const [first, last] = [focusable[0], focusable[focusable.length - 1]];
		const edge = event.shiftKey
			? document.activeElement === first
			: document.activeElement === last;
		if (!edge && dialog.contains(document.activeElement)) return;
		(event.shiftKey ? last : first)?.focus();
		event.preventDefault();
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
			return wrapTab(event);
		}
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key === 'ArrowRight') next();
		else if (event.key === 'ArrowLeft') previous();
		else if (event.key === ' ' && !(event.target as Element).closest('button, a, input, select')) {
			const first = stepTimers(recipe, step, current.segments)[0];
			if (!first) return;
			unlockAudio();
			timers.start(first);
		} else return;
		event.preventDefault();
	}

	function pointerdown(event: PointerEvent) {
		swipe = event.pointerType === 'mouse' ? undefined : { x: event.clientX, y: event.clientY };
	}

	function pointerup(event: PointerEvent) {
		if (!swipe) return;
		const [dx, dy] = [event.clientX - swipe.x, event.clientY - swipe.y];
		swipe = undefined;
		if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
		if (dx < 0) next();
		else previous();
	}
</script>

<svelte:window onkeydown={keydown} />

<dialog bind:this={dialog} aria-labelledby="{id}-title" onclose={() => onexit(opener)}>
	<TimerStrip />
	<header>
		<button type="button" class="icon" aria-label="Exit cook mode" onclick={() => dialog.close()}>
			<Icon name="x" />
		</button>
		<div class="heading">
			<p class="label" id="{id}-title">{recipe.title}</p>
			<p class="num progress" role="status">Step {step} of {total}</p>
		</div>
		<button
			type="button"
			class="dark"
			aria-pressed={dark}
			onclick={() => theme.set(dark ? 'light' : 'dark')}
		>
			<Icon name="moon" size={18} />Dark
		</button>
	</header>
	<progress value={step} max={total} aria-hidden="true"></progress>
	{#if !awake}
		<p class="notice">
			<Icon name="info" size={18} />Keep your screen on: this browser can't do it for you
		</p>
	{/if}

	<div class="body">
		<aside aria-label="All ingredients">
			{#if model.scaled}
				<p class="scaled num">Scaled to {model.view.servings}</p>
			{/if}
			{#each model.view.groups as group, g (g)}
				<div class="group">
					{#if group.name}<h2 class="label">{group.name}</h2>{/if}
					<ul>
						{#each group.items as item, i (i)}
							{@const [before, amount, after] = splitAmount(item.text)}
							<li class:current={item.key && usedKeys.includes(item.key)}>
								{before}{#if amount}<span class="num">{amount}</span>{/if}{after}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</aside>

		<!-- Swiping is a convenience for wet hands; the buttons and arrow keys do the same. -->
		<section
			class="step"
			aria-label="Step {step}"
			onpointerdown={pointerdown}
			onpointerup={pointerup}
			onpointercancel={() => (swipe = undefined)}
		>
			{#key step}
				<div class="content">
					{#if stage}<h2 class="label stage">{stage}</h2>{/if}
					{#if used.length}
						<ul class="used" aria-label="In this step">
							{#each used as segment (segment.text)}
								{@const [before, amount, after] = splitAmount(segment.text)}
								<li>
									{before}{#if amount}<span class="num">{amount}</span>{/if}{after}
								</li>
							{/each}
						</ul>
					{/if}
					<div class="text"><StepText step={current} {recipe} number={step} /></div>
					{#if current.hint}
						<p class="hint"><Icon name="alert" size={18} />{current.hint}</p>
					{/if}
				</div>
			{/key}
		</section>
	</div>

	<footer>
		<button type="button" class="nav" disabled={step === 1} onclick={previous}>
			<Icon name="chevronLeft" />Previous
		</button>
		<!-- svelte-ignore a11y_autofocus -->
		<button type="button" class="nav primary" autofocus onclick={next}>
			{step < total ? 'Next' : 'Finish'}<Icon name="chevronRight" />
		</button>
	</footer>
</dialog>

<style>
	dialog {
		inset: 0;
		inline-size: 100%;
		max-inline-size: none;
		block-size: 100dvh;
		max-block-size: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: var(--colour-bg);
		color: var(--colour-ink);
	}

	dialog[open] {
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: env(safe-area-inset-top, 0px) var(--gutter) 0;
	}

	.heading {
		display: grid;
		flex: 1;
		min-inline-size: 0;
	}

	.heading .label {
		overflow: hidden;
		color: var(--colour-muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress {
		font-size: var(--text-l);
	}

	.icon,
	.dark,
	.nav {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		min-inline-size: var(--target);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		font-weight: 700;
	}

	.dark {
		padding-inline: var(--space-3);
	}

	.dark[aria-pressed='true'] {
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	progress {
		appearance: none;
		inline-size: 100%;
		block-size: 0.25rem;
		border: 0;
		background: var(--colour-line);
		color: var(--colour-primary);
	}

	progress::-webkit-progress-bar {
		background: var(--colour-line);
	}

	progress::-webkit-progress-value {
		background: var(--colour-primary);
	}

	progress::-moz-progress-bar {
		background: var(--colour-primary);
	}

	.notice {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--gutter);
		background: var(--colour-tint);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.body {
		display: grid;
		flex: 1;
		align-items: start;
		min-block-size: 0;
		overflow-y: auto;
		padding: var(--space-5) var(--gutter);
	}

	aside {
		display: none;
	}

	.step {
		display: grid;
		justify-items: center;
		align-content: start;
		min-block-size: 100%;
		touch-action: pan-y;
	}

	.content {
		display: grid;
		gap: var(--space-4);
		inline-size: 100%;
		max-inline-size: 40ch;
		animation: enter var(--duration-panel) var(--ease-out);
	}

	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
	}

	h2 {
		font-family: var(--font-body);
		letter-spacing: 0.08em;
	}

	.stage {
		color: var(--colour-accent);
	}

	.used {
		display: grid;
		padding: 0 var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		font-size: var(--text-l);
	}

	.used li {
		padding-block: var(--space-2);
		border-block-end: 1px dashed var(--colour-line);
	}

	.used li:last-child {
		border-block-end: 0;
	}

	.text {
		font-size: var(--text-2xl);
		line-height: 1.4;
	}

	.hint {
		display: flex;
		align-items: start;
		gap: var(--space-2);
		color: var(--colour-warning);
		font-size: var(--text-s);
	}

	footer {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		padding: var(--space-3) var(--gutter) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
		border-block-start: 1px solid var(--colour-line);
		background: var(--colour-surface);
	}

	.nav {
		min-block-size: 4rem;
		font-size: var(--text-l);
	}

	.nav.primary {
		border-color: var(--colour-primary);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	.nav:disabled {
		opacity: 0.5;
	}

	.text :global(.timer) {
		min-block-size: var(--target);
		padding-inline: var(--space-3);
	}

	@media (min-width: 48rem) {
		.text {
			font-size: var(--text-3xl);
		}

		.used {
			font-size: var(--text-xl);
		}
	}

	@media (min-width: 64rem) {
		.body {
			grid-template-columns: 22rem minmax(0, 1fr);
			gap: var(--space-6);
			padding-inline: max(var(--gutter), calc((100% - var(--page-max)) / 2));
		}

		.step {
			justify-items: start;
		}

		aside {
			display: grid;
			gap: var(--space-3);
			align-content: start;
			max-block-size: 100%;
			padding-inline-end: var(--space-4);
			border-inline-end: 1px solid var(--colour-line);
		}

		.group {
			display: grid;
			gap: var(--space-1);
		}

		aside li {
			padding: var(--space-1) var(--space-2);
			border-block-end: 1px dashed var(--colour-line);
			border-inline-start: 3px solid transparent;
			color: var(--colour-muted);
		}

		aside .current {
			border-inline-start-color: var(--colour-primary);
			background: var(--colour-tint);
			color: var(--colour-ink);
			font-weight: 700;
		}

		.scaled {
			color: var(--colour-primary);
		}
	}

	@media print {
		dialog {
			display: none;
		}
	}
</style>
