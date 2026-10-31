<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { afterNavigate, invalidate, replaceState } from '$app/navigation';
	import type { QrMatrix } from '$lib/card/layout';
	import { createAiClient } from '$lib/ai';
	import { loadCore, qrMatrix } from '$lib/core';
	import { sectionTrail } from '$lib/data/tree';
	import { admin } from '$lib/admin/session.svelte';
	import { editHref, homeHref, pageHref } from '$lib/links';
	import { photoOf, photoUrl } from '$lib/photo';
	import { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { buildRecipeJsonLd, toScriptJson } from '$lib/seo/recipe-jsonld';
	import { CARD_SIZES, canonicalUrl, cardUrl } from '$lib/seo/site';
	import { LiveRecipe, watchesUpdates } from '$lib/kitchen/live.svelte';
	import { itemsFromGroups } from '$lib/kitchen/shopping';
	import { servingsText } from '$lib/recipe/format';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { favourites } from '$lib/stores/favourites.svelte';
	import { Notes } from '$lib/stores/notes.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { recent } from '$lib/stores/recent.svelte';
	import { shopping } from '$lib/stores/shopping.svelte';
	import { Ticks } from '$lib/stores/ticks.svelte';
	import { siteTitle } from '$lib/title';
	import type { RecipeCard as Card, RecipeData, SiteIndex } from '$lib/types/recipe';
	import ActionBar from './ActionBar.svelte';
	import Icon from './Icon.svelte';
	import Breadcrumb from './Breadcrumb.svelte';
	import IngredientsPanel from './IngredientsPanel.svelte';
	import MethodPanel from './MethodPanel.svelte';
	import PageHead from './PageHead.svelte';
	import Planner from './Planner.svelte';
	import PrintCard from './PrintCard.svelte';
	import RecipeCard from './RecipeCard.svelte';
	import RecipeHeader from './RecipeHeader.svelte';
	import RecipeNotes from './RecipeNotes.svelte';
	import ServingsBar from './ServingsBar.svelte';
	import ShareSheet from './ShareSheet.svelte';
	import SousChef from './SousChef.svelte';

	let {
		card,
		data,
		index,
		local = false
	}: {
		card: Card;
		data: RecipeData;
		index: SiteIndex;
		/** Added on this device: not published, so there is no public page or link; the card can still be sent. */
		local?: boolean;
	} = $props();

	type Tab = 'ingredients' | 'method';
	const tabs: { id: Tab; label: string }[] = [
		{ id: 'ingredients', label: 'Ingredients' },
		{ id: 'method', label: 'Method' }
	];

	const id = $props.id();
	// The page remounts this component for each recipe, so the props are read once.
	const model = untrack(() => new RecipeModel(data, () => preferences.units));
	const ticks = untrack(() => new Ticks(card.id));
	const notes = untrack(() => new Notes(card.id));
	const recipe = untrack(() => ({ id: card.id, title: data.recipe.title }));
	/** A recipe on this device cannot change anywhere else, so only published ones are watched. */
	const live = untrack(() =>
		local || !watchesUpdates ? undefined : new LiveRecipe(card.id, () => data.recipe)
	);
	let updating = $state(false);
	let dismissed = $state(false);

	let hydrated = $state(false);
	let restored = $state(false);
	let tab = $state<Tab>('ingredients');
	let sheet: ShareSheet | undefined = $state();
	const ai = createAiClient();
	let chef: SousChef | undefined = $state();
	let printingCard = $state(false);
	let printQr = $state<QrMatrix | null>(null);

	/** The step cook mode is on (1-based), or `null` while it is closed. `?cook=3` deep-links to a step. */
	let cookStep = $state<number | null>(null);
	// Opened by a link, cook mode has its own history entry, so leaving it goes back one.
	let cookEntry: 'load' | 'link' = 'load';
	let seenUrl = false;
	// Loaded when first needed, so a page that is never cooked from does not carry it.
	let CookMode = $state.raw<typeof import('./CookMode.svelte').default>();

	const cookHref = $derived(model.search('?cook'));
	const description = $derived(
		data.recipe.summary.length > 155
			? `${data.recipe.summary.slice(0, 152).trimEnd()}...`
			: data.recipe.summary
	);
	const photo = $derived(photoOf(card.image));
	const jsonLd = $derived(
		toScriptJson(
			buildRecipeJsonLd({
				recipe: data.recipe,
				view: data.view,
				section: data.section,
				url: canonicalUrl(card.id),
				image: [
					...(photo ? [photoUrl(card.id, photo.widths)] : []),
					cardUrl(card.id, 'og'),
					cardUrl(card.id, 'portrait')
				]
			})
		)
	);
	// Assembled here because a literal closing script tag cannot sit inside a component's markup.
	const jsonLdTag = $derived(`<script type="application/ld+json">${jsonLd}</${'script'}>`);
	const trail = $derived([
		{ label: 'Home', href: homeHref() },
		...sectionTrail(index, card.id).map((node) => ({
			label: node.title,
			href: pageHref(node.path)
		})),
		{ label: card.title }
	]);

	onMount(() => {
		preferences.load();
		favourites.load();
		ticks.load();
		notes.load();
		shopping.load();
		recent.add(card.id);
		model.restore(location.search);
		restored = true;
		hydrated = true;
		chrome.hasActionBar = true;
		// Coming back to the tab is when an update is worth looking for.
		const look = () => document.visibilityState === 'visible' && void live?.check();
		document.addEventListener('visibilitychange', look);
		window.addEventListener('focus', look);
		loadCore()
			.then(() => (model.ready = true))
			.catch(() => chrome.notify('Scaling could not load. The recipe is shown as written.', 6000));
		return () => {
			chrome.hasActionBar = false;
			document.removeEventListener('visibilitychange', look);
			window.removeEventListener('focus', look);
		};
	});

	/** Reloads the recipe's data in place: servings, ticks, timers and the list are all kept. */
	async function showUpdate() {
		if (!live) return;
		updating = true;
		await live.prepare();
		await invalidate((url) => url.pathname === live.url);
	}

	$effect(() => {
		if (!restored) return;
		const next = model.search(location.search);
		if (next === location.search) return;
		try {
			replaceState(`${location.pathname}${next}${location.hash}`, {});
		} catch {
			/* the router is not ready yet; the next change will write the URL */
		}
	});

	$effect(() => {
		if (!hydrated) return;
		const value = page.url.searchParams.get('cook');
		untrack(() => {
			const next =
				value === null
					? null
					: Math.min(Math.max(1, Math.floor(Number(value)) || 1), model.view.steps.length);
			if (next !== null && cookStep === null) cookEntry = seenUrl ? 'link' : 'load';
			seenUrl = true;
			cookStep = next;
		});
	});

	$effect(() => {
		if (cookStep !== null && !CookMode) {
			import('./CookMode.svelte')
				.then((module) => (CookMode = module.default))
				.catch(() =>
					chrome.notify('Cook mode could not load. Reload the page to try again.', 6000)
				);
		}
	});

	function writeCook(step: number | null) {
		const params = new SvelteURLSearchParams(location.search);
		if (step === null) params.delete('cook');
		else params.set('cook', String(step));
		const next = model.search(params.size ? `?${params}` : '');
		try {
			replaceState(`${location.pathname}${next}${location.hash}`, {});
		} catch {
			/* the router is not ready yet */
		}
	}

	function cookTo(step: number) {
		cookStep = step;
		writeCook(step);
	}

	// SvelteKit moves focus to the page after a Back navigation, so cook mode's opener is refocused after it.
	let returnFocus: HTMLElement | null = null;

	afterNavigate(({ type }) => {
		const target = returnFocus;
		returnFocus = null;
		if (type === 'popstate' && target?.isConnected) setTimeout(() => target.focus());
	});

	function exitCook(opener: HTMLElement | null) {
		returnFocus = opener;
		if (cookStep === null) return;
		cookStep = null;
		if (cookEntry === 'link') history.back();
		else writeCook(null);
	}

	function addToList() {
		const items = itemsFromGroups(model.view.groups);
		const updated = shopping.has(card.id);
		shopping.add({
			id: card.id,
			title: data.recipe.title,
			serves: servingsText(model.view.servings, data.recipe.servingsNoun),
			items
		});
		chrome.notify(
			updated
				? 'Shopping list updated for this recipe'
				: `Added ${items.length} ingredients to your shopping list`
		);
	}

	const share = () => sheet?.show();

	/** Prints the A5 index card: the page shows only the card while the browser's print dialog is open. */
	async function printCard() {
		try {
			await loadCore();
			printQr = local ? null : (qrMatrix(`${canonicalUrl(card.id)}${model.search('')}`) ?? null);
		} catch {
			printQr = null;
		}
		printingCard = true;
		await tick();
		window.addEventListener('afterprint', () => (printingCard = false), { once: true });
		window.print();
	}

	function moveTab(event: KeyboardEvent) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		tab = tab === 'ingredients' ? 'method' : 'ingredients';
		document.getElementById(`${id}-tab-${tab}`)?.focus();
		event.preventDefault();
	}
</script>

{#if !local}
	<PageHead
		title={data.recipe.title}
		{description}
		path={card.id}
		type="article"
		image={{
			url: cardUrl(card.id),
			...CARD_SIZES.og,
			alt: `Recipe card for ${data.recipe.title}, from ${siteTitle}`
		}}
	/>
{/if}
<svelte:head>
	{#if local}
		<title>{data.recipe.title} | {siteTitle}</title>
	{:else}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- the JSON is escaped by toScriptJson -->
		{@html jsonLdTag}
	{/if}
</svelte:head>

<article class:printing-card={printingCard}>
	<Breadcrumb {trail} />
	{#if local}
		<p class="device">
			<Icon name="device" size={18} />
			<span>Your recipe. It is kept in this browser only, so only you can see it.</span>
		</p>
	{/if}
	{#if live?.updated && !dismissed && cookStep === null}
		<div class="update" role="status">
			<Icon name="info" size={18} />
			<span>This recipe was updated.</span>
			<button type="button" class="show" disabled={updating} onclick={showUpdate}>
				{updating ? 'Loading...' : 'Show the new version'}
			</button>
			<button
				type="button"
				class="later"
				aria-label="Keep this version for now"
				onclick={() => (dismissed = true)}
			>
				<Icon name="x" size={18} />
			</button>
		</div>
	{/if}
	<RecipeHeader
		{card}
		{model}
		{hydrated}
		{cookHref}
		onshare={share}
		onaddlist={addToList}
		onask={ai ? () => chef?.show() : undefined}
		edithref={local || admin.unlocked ? editHref({ id: card.id }) : undefined}
	/>
	<ServingsBar {model} />

	{#if hydrated}
		<div class="tabs" role="tablist" aria-label="Recipe sections">
			{#each tabs as { id: tabId, label } (tabId)}
				<button
					type="button"
					role="tab"
					id="{id}-tab-{tabId}"
					aria-selected={tab === tabId}
					aria-controls="{id}-panel-{tabId}"
					tabindex={tab === tabId ? 0 : -1}
					onclick={() => (tab = tabId)}
					onkeydown={moveTab}>{label}</button
				>
			{/each}
		</div>
	{/if}

	<div class="columns">
		<div
			class="ingredients"
			class:inactive={hydrated && tab !== 'ingredients'}
			role="tabpanel"
			id="{id}-panel-ingredients"
			aria-labelledby={hydrated ? `${id}-tab-ingredients` : undefined}
		>
			<IngredientsPanel {model} {ticks} {hydrated} />
		</div>
		<div
			class="method"
			class:inactive={hydrated && tab !== 'method'}
			role="tabpanel"
			id="{id}-panel-method"
			aria-labelledby={hydrated ? `${id}-tab-method` : undefined}
		>
			<Planner steps={model.view.steps} />
			<MethodPanel {model} {ticks} {hydrated} {recipe} />
			{#if model.view.tips.length}
				<aside class="tip">
					<h2 class="label">Chef's tip</h2>
					{#each model.view.tips as tip (tip)}<p>{tip}</p>{/each}
				</aside>
			{/if}
		</div>
	</div>

	<RecipeNotes {notes} {hydrated} />

	{#if data.related.length}
		<section class="related" aria-labelledby="{id}-related">
			<h2 id="{id}-related">Related recipes</h2>
			<ul>
				{#each data.related as related (related.id)}
					<li><RecipeCard card={related} /></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if hydrated}<ActionBar {model} {cookHref} onshare={share} />{/if}
	{#if hydrated && cookStep !== null && CookMode}
		<CookMode {model} {recipe} {ticks} step={cookStep} onstep={cookTo} onexit={exitCook} />
	{/if}
	{#if hydrated}<ShareSheet bind:this={sheet} {card} {model} {local} onprint={printCard} />{/if}
	{#if hydrated && ai}
		<SousChef bind:this={chef} client={ai} recipeId={card.id} recipe={data.recipe} />
	{/if}
	{#if printingCard}<PrintCard {card} {model} qr={printQr} />{/if}
</article>

<style>
	.update {
		position: sticky;
		inset-block-start: var(--space-2);
		z-index: 6;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-block-end: var(--space-4);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border: 1px solid var(--colour-line);
		border-inline-start: 4px solid var(--colour-primary);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		box-shadow: var(--shadow-float);
		font-weight: 700;
	}

	.update > :global(svg) {
		flex: none;
		color: var(--colour-primary);
	}

	.update span {
		flex: 1 1 auto;
	}

	.update button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-block-size: var(--target);
		border-radius: var(--radius-s);
		font-weight: 700;
	}

	.show {
		padding-inline: var(--space-4);
		border: 0;
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	.show:disabled {
		opacity: 0.7;
	}

	.later {
		inline-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-muted);
	}

	.later:hover {
		background: var(--colour-tint);
	}

	article {
		display: grid;
		gap: var(--space-5);
	}

	.device {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--colour-primary);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		color: var(--colour-primary);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.tabs {
		display: flex;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		overflow: hidden;
	}

	.tabs button {
		flex: 1;
		min-block-size: var(--target);
		border: 0;
		background: transparent;
		color: var(--colour-primary);
		font-weight: 700;
	}

	.tabs button + button {
		border-inline-start: 1px solid var(--colour-line);
	}

	.tabs [aria-selected='true'] {
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	.tabs button:focus-visible {
		outline-offset: -4px;
	}

	.tabs [aria-selected='true']:focus-visible {
		outline-color: var(--colour-on-primary);
	}

	.columns {
		display: grid;
		gap: var(--space-6);
	}

	.method {
		display: grid;
		gap: var(--space-5);
		align-content: start;
	}

	.tip {
		display: grid;
		gap: var(--space-2);
		max-inline-size: var(--measure);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
	}

	.tip .label {
		color: var(--colour-accent);
		font-family: var(--font-body);
		letter-spacing: 0.08em;
	}

	.related {
		display: grid;
		gap: var(--space-3);
	}

	.related ul {
		display: grid;
		grid-template-columns: var(--card-grid);
		gap: var(--space-4);
	}

	@media screen and (max-width: 47.99rem) {
		.inactive {
			display: none;
		}
	}

	@media (min-width: 48rem) {
		.tabs {
			display: none;
		}

		.columns {
			grid-template-columns: minmax(16rem, 22rem) 1fr;
			align-items: start;
		}
	}

	@media print {
		article {
			gap: var(--space-3);
		}

		/* While the index card prints, nothing else on the page does. */
		.printing-card > :global(:not(.index-card)) {
			display: none;
		}

		.tabs,
		.tip,
		.related {
			display: none;
		}

		.columns {
			grid-template-columns: 30% 1fr;
			gap: var(--space-4);
			align-items: start;
		}
	}
</style>
