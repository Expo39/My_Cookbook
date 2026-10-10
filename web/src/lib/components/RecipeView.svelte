<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { loadCore } from '$lib/core';
	import { sectionTrail } from '$lib/data/tree';
	import { homeHref, pageHref } from '$lib/links';
	import { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { buildRecipeJsonLd, toScriptJson } from '$lib/seo/recipe-jsonld';
	import { canonicalUrl, cardUrl } from '$lib/seo/site';
	import { itemsFromGroups } from '$lib/kitchen/shopping';
	import { servingsText } from '$lib/recipe/format';
	import { shareLink } from '$lib/share';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { favourites } from '$lib/stores/favourites.svelte';
	import { Notes } from '$lib/stores/notes.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { recent } from '$lib/stores/recent.svelte';
	import { shopping } from '$lib/stores/shopping.svelte';
	import { Ticks } from '$lib/stores/ticks.svelte';
	import type { RecipeCard as Card, RecipeData, SiteIndex } from '$lib/types/recipe';
	import ActionBar from './ActionBar.svelte';
	import Breadcrumb from './Breadcrumb.svelte';
	import IngredientsPanel from './IngredientsPanel.svelte';
	import MethodPanel from './MethodPanel.svelte';
	import PageHead from './PageHead.svelte';
	import Planner from './Planner.svelte';
	import RecipeCard from './RecipeCard.svelte';
	import RecipeHeader from './RecipeHeader.svelte';
	import RecipeNotes from './RecipeNotes.svelte';
	import ServingsBar from './ServingsBar.svelte';

	let { card, data, index }: { card: Card; data: RecipeData; index: SiteIndex } = $props();

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

	let hydrated = $state(false);
	let restored = $state(false);
	let tab = $state<Tab>('ingredients');

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
			? `${data.recipe.summary.slice(0, 152).trimEnd()}…`
			: data.recipe.summary
	);
	const jsonLd = $derived(
		toScriptJson(
			buildRecipeJsonLd({
				recipe: data.recipe,
				view: data.view,
				section: data.section,
				url: canonicalUrl(card.id),
				image: cardUrl(card.id)
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
		loadCore()
			.then(() => (model.ready = true))
			.catch(() => chrome.notify('Scaling could not load. The recipe is shown as written.', 6000));
		return () => (chrome.hasActionBar = false);
	});

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

	async function share() {
		const outcome = await shareLink(
			card.title,
			`${location.origin}${location.pathname}${model.search('')}`
		);
		if (outcome === 'copied') chrome.notify('Link copied');
		if (outcome === 'failed')
			chrome.notify('Could not share. Copy the address from the bar instead.', 5000);
	}

	function moveTab(event: KeyboardEvent) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		tab = tab === 'ingredients' ? 'method' : 'ingredients';
		document.getElementById(`${id}-tab-${tab}`)?.focus();
		event.preventDefault();
	}
</script>

<PageHead
	title={data.recipe.title}
	{description}
	path={card.id}
	type="article"
	image={cardUrl(card.id)}
/>
<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- the JSON is escaped by toScriptJson -->
	{@html jsonLdTag}
</svelte:head>

<article class:enhanced={hydrated}>
	<Breadcrumb {trail} />
	<RecipeHeader {card} {model} {hydrated} {cookHref} onshare={share} onaddlist={addToList} />
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
		<CookMode {model} {recipe} step={cookStep} onstep={cookTo} onexit={exitCook} />
	{/if}
</article>

<style>
	article {
		display: grid;
		gap: var(--space-5);
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
		grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
		gap: var(--space-4);
	}

	@media screen and (max-width: 47.99rem) {
		.inactive {
			display: none;
		}

		/* Keeps the last lines of the page clear of the fixed bar. */
		.enhanced {
			padding-block-end: calc(var(--bar-height) + env(safe-area-inset-bottom, 0px));
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

	@media (min-width: 64rem) {
		.ingredients {
			position: sticky;
			inset-block-start: var(--space-5);
			max-block-size: calc(100dvh - 2 * var(--space-5));
			overflow-y: auto;
		}
	}

	@media print {
		article {
			gap: var(--space-3);
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

		.ingredients {
			position: static;
			max-block-size: none;
			overflow: visible;
		}
	}
</style>
