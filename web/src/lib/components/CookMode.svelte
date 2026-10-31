<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { unlockAudio } from '$lib/kitchen/alert';
	import { stepTimers } from '$lib/kitchen/timer-ids';
	import { ScreenAwake } from '$lib/kitchen/wake-lock';
	import { splitAmount } from '$lib/recipe/format';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { stepIngredients } from '$lib/recipe/step-ingredients';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { ingredientTick, type Ticks } from '$lib/stores/ticks.svelte';
	import { timers } from '$lib/stores/timers.svelte';
	import type { ScaledGroup, ScaledIngredient, ScaledStep } from '$lib/types/recipe';
	import Icon from './Icon.svelte';
	import StepText from './StepText.svelte';
	import TimerStrip from './TimerStrip.svelte';

	let {
		model,
		recipe,
		ticks,
		step,
		onstep,
		onexit
	}: {
		model: RecipeModel;
		recipe: { id: string; title: string };
		ticks: Ticks;
		step: number;
		onstep: (step: number) => void;
		/** Told where focus should return to, which the page restores once any navigation has settled. */
		onexit: (opener: HTMLElement | null) => void;
	} = $props();

	const id = $props.id();
	const prefersDark = new MediaQuery('prefers-color-scheme: dark');
	const wide = new MediaQuery('min-width: 64rem');
	const SWIPE = 60;

	let dialog: HTMLDialogElement;
	let pantry = $state<HTMLElement>();
	let awake = $state(true);
	let swipe: { x: number; y: number } | undefined;
	let opener: HTMLElement | null = null;
	/** The full list as a sheet, on screens too narrow to keep it beside the step. */
	let listOpen = $state(false);
	let done = $state(false);

	const steps = $derived(model.view.steps);
	const groups = $derived(model.view.groups);
	const total = $derived(steps.length);
	const current = $derived(steps[step - 1]);
	const upcoming = $derived<ScaledStep | undefined>(steps[step]);
	const stage = $derived(steps.slice(0, step).findLast((entry) => entry.heading)?.heading);
	const dark = $derived(
		theme.choice === 'dark' || (theme.choice === 'system' && prefersDark.current)
	);
	const byStep = $derived(stepIngredients(steps, groups));
	const used = $derived(byStep[step - 1] ?? []);
	const usedLines = $derived(new Set(used.map((entry) => `${entry.group}/${entry.index}`)));
	const severalParts = $derived(new Set(used.map((entry) => entry.group)).size > 1);
	const lineCount = $derived(groups.reduce((sum, group) => sum + group.items.length, 0));
	const tickKeys = $derived(
		groups.flatMap((group) => group.items.map((item) => ingredientTick(group, item)))
	);
	const ready = $derived(ticks.countOf(tickKeys));
	const preview = $derived(upcoming ? sentence(upcoming) : '');
	/** While the list is a sheet over the step, only the sheet can be used. */
	const covered = $derived(listOpen && !wide.current);

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

	// A new step leaves the finished screen, and brings its lines into view in the full list.
	$effect(() => {
		void step;
		done = false;
		tick().then(() =>
			pantry?.querySelector('.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		);
	});

	/** The step's text without its markup, cut to its first sentence, for "Up next". */
	function sentence(entry: ScaledStep): string {
		const text = entry.segments
			.map((segment) => segment.text)
			.join('')
			.trim();
		const end = text.search(/[.!?](\s|$)/);
		return end > 0 && end < 140
			? text.slice(0, end + 1)
			: text.length > 140
				? `${text.slice(0, 137)}...`
				: text;
	}

	function wording(item: ScaledIngredient): [string, string] {
		const [before, amount, after] = splitAmount(item.text);
		return [amount, `${before}${after}`.replace(/\s+/g, ' ').trim()];
	}

	const previous = () => step > 1 && onstep(step - 1);
	const next = () => (step < total ? onstep(step + 1) : finish());

	async function finish() {
		done = true;
		await tick();
		dialog.querySelector<HTMLElement>('.done h2')?.focus();
	}

	async function openList() {
		listOpen = true;
		await tick();
		pantry?.querySelector<HTMLElement>('.close-list')?.focus();
	}

	function closeList() {
		listOpen = false;
		dialog.querySelector<HTMLElement>('.list-button')?.focus();
	}

	/** Esc closes the sheet first, then cook mode. */
	function cancel(event: Event) {
		if (!listOpen) return;
		event.preventDefault();
		closeList();
	}

	/** The dialog keeps the rest of the page inert; this also stops Tab leaving for the browser's own controls. */
	function wrapTab(event: KeyboardEvent) {
		const focusable = [
			...dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), a[href], input, select, textarea'
			)
		].filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
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
		if (listOpen) return;
		if (event.key === 'ArrowRight') next();
		else if (event.key === 'ArrowLeft') previous();
		else if (event.key === 'i' && !wide.current) openList();
		else if (
			event.key === ' ' &&
			!(event.target as Element).closest('button, a, input, select, label')
		) {
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

{#snippet line(group: ScaledGroup, item: ScaledIngredient, part?: string | null)}
	{@const key = ingredientTick(group, item)}
	{@const [amount, words] = wording(item)}
	<label class="line" class:ticked={ticks.has(key)}>
		<input type="checkbox" checked={ticks.has(key)} onchange={() => ticks.toggle(key)} />
		<span class="amount num">{amount}</span>
		<span class="item">
			{words}{#if part}<span class="part">{part}</span>{/if}
		</span>
	</label>
{/snippet}

<dialog
	bind:this={dialog}
	aria-labelledby="{id}-title"
	oncancel={cancel}
	onclose={() => onexit(opener)}
>
	<TimerStrip />
	<header inert={covered}>
		<button type="button" class="icon" aria-label="Exit cook mode" onclick={() => dialog.close()}>
			<Icon name="x" />
		</button>
		<div class="heading">
			<p class="eyebrow label">Cooking</p>
			<p class="title" id="{id}-title">{recipe.title}</p>
		</div>
		<button
			type="button"
			class="icon"
			aria-label="Dark theme"
			aria-pressed={dark}
			onclick={() => theme.set(dark ? 'light' : 'dark')}
		>
			<Icon name="moon" size={20} />
		</button>
	</header>
	<div class="rail" aria-hidden="true">
		{#each { length: total }, s (s)}
			<span class:past={s + 1 < step || done} class:now={s + 1 === step && !done}></span>
		{/each}
	</div>
	{#if !awake}
		<p class="notice">
			<Icon name="info" size={18} />Keep your screen on: this browser can't do it for you
		</p>
	{/if}

	<div class="body">
		<aside
			bind:this={pantry}
			class:open={listOpen}
			aria-labelledby="{id}-list"
			inert={!wide.current && !listOpen}
		>
			<div class="list-head">
				<h2 class="label" id="{id}-list">All ingredients</h2>
				<span class="ready"><span class="num">{ready} of {lineCount}</span> ready</span>
				<button
					type="button"
					class="icon close-list"
					aria-label="Close the list"
					onclick={closeList}
				>
					<Icon name="x" />
				</button>
			</div>
			{#if model.scaled}
				<p class="scaled num">Scaled to {model.view.servings}</p>
			{/if}
			{#each groups as group, g (g)}
				<div class="group">
					{#if group.name}<h3 class="label">{group.name}</h3>{/if}
					<ul>
						{#each group.items as item, i (i)}
							<li class:current={usedLines.has(`${g}/${i}`)}>{@render line(group, item)}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</aside>

		<!-- Swiping is a convenience for wet hands; the buttons and arrow keys do the same. -->
		<section
			class="step"
			inert={covered}
			aria-label={done ? 'Finished' : `Step ${step}`}
			onpointerdown={pointerdown}
			onpointerup={pointerup}
			onpointercancel={() => (swipe = undefined)}
		>
			{#if done}
				<div class="content done">
					<span class="seal"><Icon name="checkCircle" size={40} /></span>
					<h2 tabindex="-1">Ready to serve</h2>
					<p class="lede">Every step of {recipe.title} is done. Enjoy it.</p>
					{#if model.view.tips.length}
						<div class="tips">
							<h3 class="label">From the chef</h3>
							{#each model.view.tips as tip, t (t)}<p>{tip}</p>{/each}
						</div>
					{/if}
					<div class="done-actions">
						<button type="button" class="nav primary" onclick={() => dialog.close()}>
							Back to the recipe
						</button>
						<button type="button" class="nav" onclick={() => onstep(1)}>
							<Icon name="reset" size={18} />Cook it again
						</button>
					</div>
				</div>
			{:else}
				{#key step}
					<div class="content">
						<div class="marker">
							<span class="numeral num" aria-hidden="true">{step}</span>
							<div class="where">
								<p class="num progress" role="status">Step {step} of {total}</p>
								{#if stage}<h2 class="label stage">{stage}</h2>{/if}
							</div>
						</div>

						<div class="text"><StepText step={current} {recipe} number={step} /></div>
						{#if current.hint}
							<p class="hint"><Icon name="alert" size={18} />{current.hint}</p>
						{/if}

						<section class="for-step" aria-labelledby="{id}-for">
							<h2 class="label" id="{id}-for">For this step</h2>
							{#if used.length}
								<ul aria-label="In this step">
									{#each used as entry (`${entry.group}/${entry.index}`)}
										<li>
											{@render line(
												groups[entry.group],
												entry.item,
												severalParts ? entry.groupName : undefined
											)}
										</li>
									{/each}
								</ul>
							{:else}
								<p class="nothing">Nothing new to add here.</p>
							{/if}
						</section>

						{#if upcoming}
							<div class="up-next">
								<p class="label">Up next</p>
								<p class="preview">{preview}</p>
							</div>
						{/if}
					</div>
				{/key}
			{/if}
		</section>
	</div>
	{#if covered}
		<button
			type="button"
			class="scrim"
			aria-label="Close the list"
			tabindex="-1"
			onclick={closeList}
		></button>
	{/if}

	{#if !done}
		<footer inert={covered}>
			<button type="button" class="nav back" disabled={step === 1} onclick={previous}>
				<Icon name="chevronLeft" /><span>Previous</span>
			</button>
			<button
				type="button"
				class="nav list-button"
				aria-expanded={listOpen}
				aria-haspopup="dialog"
				onclick={openList}
			>
				<Icon name="basket" size={20} />Ingredients
			</button>
			<!-- svelte-ignore a11y_autofocus -->
			<button type="button" class="nav primary" autofocus onclick={next}>
				{step < total ? 'Next' : 'Finish'}<Icon name="chevronRight" />
			</button>
		</footer>
	{/if}
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
		padding: calc(var(--space-2) + env(safe-area-inset-top, 0px)) var(--gutter) var(--space-2);
		background: var(--colour-surface);
	}

	.heading {
		display: grid;
		flex: 1;
		min-inline-size: 0;
	}

	.eyebrow {
		color: var(--colour-accent);
	}

	.title {
		overflow: hidden;
		font-family: var(--font-display);
		font-size: var(--text-l);
		font-weight: 800;
		letter-spacing: -0.02em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.icon,
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

	.icon[aria-pressed='true'] {
		border-color: var(--colour-primary);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	.rail {
		display: flex;
		gap: 3px;
		padding: 0 var(--gutter) var(--space-2);
		background: var(--colour-surface);
		border-block-end: 1px solid var(--colour-line);
	}

	.rail span {
		flex: 1;
		block-size: 0.3rem;
		border-radius: var(--radius-pill);
		background: var(--colour-line);
		transition: background-color var(--duration-panel) var(--ease-out);
	}

	.rail .past {
		background: var(--colour-primary);
	}

	.rail .now {
		background: var(--colour-accent);
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
		padding: var(--space-5) var(--gutter) var(--space-6);
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
		gap: var(--space-5);
		inline-size: 100%;
		max-inline-size: 44rem;
		animation: enter var(--duration-panel) var(--ease-out);
	}

	@keyframes enter {
		from {
			opacity: 0;
			transform: translateX(0.75rem);
		}
	}

	h2,
	h3 {
		font-family: var(--font-body);
	}

	.marker {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.numeral {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: 4.5rem;
		block-size: 4.5rem;
		border: 2px solid var(--colour-accent);
		border-radius: var(--radius-pill);
		color: var(--colour-accent);
		font-size: var(--text-3xl);
		line-height: 1;
	}

	.where {
		display: grid;
		gap: var(--space-1);
	}

	.progress {
		color: var(--colour-muted);
		font-size: var(--text-m);
	}

	.stage {
		color: var(--colour-primary);
		text-wrap: balance;
	}

	.text {
		font-size: var(--text-2xl);
		line-height: 1.45;
	}

	.text :global(.timer) {
		min-block-size: var(--target);
		padding-inline: var(--space-3);
	}

	.hint {
		display: flex;
		align-items: start;
		gap: var(--space-2);
		color: var(--colour-warning);
		font-size: var(--text-s);
	}

	.for-step {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-block-start: 4px solid var(--colour-primary);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	.for-step h2 {
		color: var(--colour-primary);
	}

	.nothing {
		color: var(--colour-muted);
	}

	/* One grid for the whole list, shared by every row through subgrid, so the boxes, amounts and
	   words each form one straight column whatever the length of the amounts. */
	ul {
		display: grid;
		grid-template-columns: auto minmax(2.5rem, max-content) minmax(0, 1fr);
		column-gap: var(--space-3);
	}

	li {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		border-block-end: 1px dashed var(--colour-line);
	}

	li:last-child {
		border-block-end: 0;
	}

	.line {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: baseline;
		min-block-size: var(--target);
		padding-block: var(--space-2);
		cursor: pointer;
		user-select: none;
	}

	/* Level with the first line of the words, not the middle of a line that wraps. */
	.line input {
		align-self: start;
		inline-size: 1.25rem;
		block-size: 1.25rem;
		margin: calc((1lh - 1.25rem) / 2) 0 0;
		accent-color: var(--colour-primary);
	}

	.amount {
		color: var(--colour-primary);
	}

	.part {
		margin-inline-start: var(--space-2);
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
		color: var(--colour-muted);
		font-size: var(--text-xs);
	}

	.ticked .amount,
	.ticked .item {
		color: var(--colour-muted);
		text-decoration: line-through;
		transition: color var(--duration-micro) var(--ease-out);
	}

	.for-step .line {
		font-size: var(--text-l);
	}

	.up-next {
		display: grid;
		gap: var(--space-1);
		padding-block-start: var(--space-4);
		border-block-start: 1px dashed var(--colour-line);
		color: var(--colour-muted);
	}

	.preview {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	aside {
		position: fixed;
		inset: auto 0 0;
		z-index: 2;
		display: none;
		gap: var(--space-3);
		align-content: start;
		max-block-size: 80dvh;
		overflow-y: auto;
		padding: var(--space-4) var(--gutter) calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
		border-radius: var(--radius-m) var(--radius-m) 0 0;
		background: var(--colour-surface);
		box-shadow: var(--shadow-float);
	}

	aside.open {
		display: grid;
		animation: rise var(--duration-panel) var(--ease-out);
	}

	@keyframes rise {
		from {
			transform: translateY(1.5rem);
			opacity: 0;
		}
	}

	.list-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.list-head h2 {
		flex: 1;
	}

	.ready {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.group {
		display: grid;
		gap: var(--space-1);
	}

	.group h3 {
		color: var(--colour-muted);
	}

	aside li {
		border-inline-start: 3px solid transparent;
		padding-inline-start: var(--space-2);
	}

	aside .current {
		border-inline-start-color: var(--colour-primary);
		background: var(--colour-tint);
	}

	.scaled {
		color: var(--colour-primary);
		font-size: var(--text-s);
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 1;
		border: 0;
		background: var(--colour-scrim);
	}

	footer {
		display: grid;
		grid-template-columns: auto 1fr 1.3fr;
		gap: var(--space-2);
		padding: var(--space-3) var(--gutter) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
		border-block-start: 1px solid var(--colour-line);
		background: var(--colour-surface);
	}

	.nav {
		min-block-size: 3.75rem;
		padding-inline: var(--space-3);
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

	.nav :global(svg) {
		flex: none;
	}

	.back span {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.done {
		justify-items: center;
		padding-block-start: var(--space-6);
		text-align: center;
	}

	.seal {
		color: var(--colour-success);
	}

	.done h2 {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		letter-spacing: -0.02em;
	}

	.lede {
		color: var(--colour-muted);
		font-size: var(--text-l);
	}

	.tips {
		display: grid;
		gap: var(--space-2);
		inline-size: 100%;
		padding: var(--space-4);
		border-inline-start: 4px solid var(--colour-accent);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		text-align: start;
	}

	.tips h3 {
		color: var(--colour-accent);
	}

	.done-actions {
		display: grid;
		gap: var(--space-3);
		inline-size: 100%;
		max-inline-size: 24rem;
	}

	@media (min-width: 30rem) {
		.back span {
			position: static;
			inline-size: auto;
			block-size: auto;
			clip-path: none;
		}
	}

	@media (min-width: 48rem) {
		.text {
			font-size: var(--text-3xl);
		}

		.numeral {
			inline-size: 5.5rem;
			block-size: 5.5rem;
			font-size: var(--text-display);
		}
	}

	@media (min-width: 64rem) {
		.body {
			grid-template-columns: 22rem minmax(0, 1fr);
			gap: var(--space-7);
			padding-inline: max(var(--gutter), calc((100% - var(--page-max)) / 2));
		}

		.step {
			justify-items: start;
		}

		aside {
			position: sticky;
			inset: 0 auto auto;
			display: grid;
			max-block-size: none;
			padding: var(--space-4);
			border: 1px solid var(--colour-line);
			border-radius: var(--radius-m);
			box-shadow: none;
		}

		.close-list,
		.list-button {
			display: none;
		}

		footer {
			grid-template-columns: 1fr 1fr;
			padding-inline: max(var(--gutter), calc((100% - var(--page-max)) / 2));
		}
	}

	@media print {
		dialog {
			display: none;
		}
	}
</style>
