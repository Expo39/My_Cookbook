<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { loadCore } from '$lib/core';
	import { sectionTrail } from '$lib/data/tree';
	import { homeHref, pageHref } from '$lib/links';
	import { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { buildRecipeJsonLd, toScriptJson } from '$lib/seo/recipe-jsonld';
	import { canonicalUrl, cardUrl } from '$lib/seo/site';
	import { shareLink } from '$lib/share';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { favourites } from '$lib/stores/favourites.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { Ticks } from '$lib/stores/ticks.svelte';
	import type { RecipeCard as Card, RecipeData, SiteIndex } from '$lib/types/recipe';
	import ActionBar from './ActionBar.svelte';
	import Breadcrumb from './Breadcrumb.svelte';
	import Icon from './Icon.svelte';
	import IngredientsPanel from './IngredientsPanel.svelte';
	import MethodPanel from './MethodPanel.svelte';
	import PageHead from './PageHead.svelte';
	import RecipeCard from './RecipeCard.svelte';
	import RecipeHeader from './RecipeHeader.svelte';
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

	let hydrated = $state(false);
	let restored = $state(false);
	let tab = $state<Tab>('ingredients');

	const cooking = $derived(hydrated && page.url.searchParams.has('cook'));
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
	<RecipeHeader {card} {model} {hydrated} onshare={share} />
	{#if cooking}
		<p class="notice" role="status"><Icon name="info" size={18} />Cook mode is on its way.</p>
	{/if}
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
			<MethodPanel {model} {ticks} {hydrated} />
			{#if model.view.tips.length}
				<aside class="tip">
					<h2 class="label">Chef's tip</h2>
					{#each model.view.tips as tip (tip)}<p>{tip}</p>{/each}
				</aside>
			{/if}
		</div>
	</div>

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
</article>

<style>
	article {
		display: grid;
		gap: var(--space-5);
	}

	.notice {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--colour-muted);
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
		.related,
		.notice {
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
