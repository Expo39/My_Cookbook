<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import PageHead from '$lib/components/PageHead.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import type { SearchEngine } from '$lib/core';
	import { localCards } from '$lib/data/local-card';
	import { allRecipes } from '$lib/data/tree';
	import { searchEngine } from '$lib/search/engine';
	import { haveLocal, searchLocal } from '$lib/search/local';
	import { personal } from '$lib/stores/personal.svelte';
	import type { RecipeCard as Card } from '$lib/types/recipe';

	let { data } = $props();

	type Mode = 'recipes' | 'have';

	const id = $props.id();
	const cards = $derived(new Map(allRecipes(data.index).map((card) => [card.id, card])));
	/** Recipes added on this device, which the published index does not know about. */
	const own = $derived(personal.list.filter((entry) => !entry.shared && !cards.has(entry.id)));
	const ownCards = $derived(new Map(localCards(data.index, own).map((card) => [card.id, card])));

	let query = $state('');
	let mode = $state<Mode>('recipes');
	let engine = $state.raw<SearchEngine>();
	let failed = $state(false);
	let synced = $state(false);

	interface Result {
		card: Card;
		coverage?: { matched: number; total: number };
		local?: boolean;
	}

	const results = $derived.by<Result[]>(() => {
		const text = query.trim();
		if (!engine || !text) return [];
		const found: Result[] = [];
		if (mode === 'have') {
			const have = text
				.split(/[,\n]/)
				.map((item) => item.trim())
				.filter(Boolean);
			for (const hit of engine.ingredientsIHave(have)) {
				const card = cards.get(hit.id);
				if (card) found.push({ card, coverage: { matched: hit.matched, total: hit.total } });
			}
			for (const hit of haveLocal(own, have)) {
				const card = ownCards.get(hit.id);
				if (card) found.push({ card, coverage: hit, local: true });
			}
			// Fewest missing ingredients first, across the cookbook's recipes and yours alike.
			const missing = ({ coverage }: Result) => (coverage ? coverage.total - coverage.matched : 0);
			found.sort((a, b) => missing(a) - missing(b));
		} else {
			for (const id of searchLocal(own, text)) {
				const card = ownCards.get(id);
				if (card) found.push({ card, local: true });
			}
			for (const hit of engine.search(text)) {
				const card = cards.get(hit.id);
				if (card) found.push({ card });
			}
		}
		return found;
	});

	const searching = $derived(query.trim() !== '');

	/** A spelling the index knows, offered when a word was not recognised. */
	const correction = $derived.by(() => {
		const text = query.trim();
		if (!engine || !text || mode !== 'recipes') return undefined;
		const found = engine.suggest(text, 6).find((s) => s.kind === 'correction');
		return found?.kind === 'correction' ? found.query : undefined;
	});
	const title = $derived(searching ? `Search: ${query.trim()}` : 'Search');

	onMount(() => {
		const params = new URLSearchParams(location.search);
		query = params.get('q') ?? '';
		mode = params.get('m') === 'have' ? 'have' : 'recipes';
		synced = true;
		void personal.load();

		searchEngine()
			.then((loaded) => (engine = loaded))
			.catch(() => (failed = true));
	});

	$effect(() => {
		if (!synced) return;
		const parts = [query && `q=${encodeURIComponent(query)}`, mode === 'have' && 'm=have'];
		const search = parts.some(Boolean) ? `?${parts.filter(Boolean).join('&')}` : '';
		if (search === location.search) return;
		try {
			replaceState(`${location.pathname}${search}`, page.state);
		} catch {
			/* the router is not ready yet; the next keystroke will write the URL */
		}
	});
</script>

<PageHead
	{title}
	description="Search the recipes by name, or by the ingredients you have."
	path="search"
/>

<div class="page">
	<h1>Search</h1>

	<form onsubmit={(event) => event.preventDefault()} role="search">
		<Segmented
			legend="Search by"
			name="{id}-mode"
			options={[
				{ value: 'recipes', label: 'Recipe name' },
				{ value: 'have', label: 'I have these ingredients' }
			]}
			value={mode}
			onchange={(value) => (mode = value as Mode)}
		/>
		<div class="field">
			<label for="{id}-query">
				{mode === 'have' ? 'Ingredients you have' : 'Search recipes'}
			</label>
			<input
				id="{id}-query"
				type="search"
				name="q"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				bind:value={query}
				aria-describedby="{id}-help"
			/>
			<p id="{id}-help" class="help">
				{mode === 'have'
					? 'Separate ingredients with commas. Recipes you can nearly make come first.'
					: 'Accents do not matter: brulee finds Crème Brûlée.'}
			</p>
		</div>
	</form>

	<noscript><p class="help">Search needs JavaScript to run in your browser.</p></noscript>

	<section aria-live="polite">
		{#if failed}
			<p class="status">Search could not load. Reload the page to try again.</p>
		{:else if !searching}
			<p class="status">
				Type a recipe name{mode === 'have' ? ' or the ingredients in your kitchen' : ''} to begin.
			</p>
		{:else if !engine}
			<p class="status">Loading search...</p>
		{:else}
			{#if correction}
				<p class="status">
					Did you mean
					<button type="button" class="fix" onclick={() => (query = correction ?? query)}
						>{correction}</button
					>?
				</p>
			{/if}
			{#if results.length === 0}
				<p class="status">
					Nothing matches "{query.trim()}". Try fewer words, or switch to the ingredients you have.
				</p>
			{:else}
				<p class="status">
					<span class="num">{results.length}</span>
					{results.length === 1 ? 'recipe' : 'recipes'} found
				</p>
				<ul>
					{#each results as { card, coverage, local } (card.id)}
						<li><RecipeCard {card} {coverage} {local} /></li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>
</div>

<style>
	.page,
	section,
	form {
		display: grid;
		gap: var(--space-4);
	}

	.page {
		gap: var(--space-5);
	}

	form {
		max-inline-size: 40rem;
	}

	.field {
		display: grid;
		gap: var(--space-1);
	}

	label {
		font-weight: 700;
	}

	input {
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border: 1px solid var(--colour-muted);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		font-size: var(--text-l);
	}

	input:focus-visible {
		border-color: var(--colour-primary);
	}

	.help,
	.status {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.status {
		font-size: var(--text-m);
	}

	ul {
		display: grid;
		grid-template-columns: var(--card-grid);
		gap: var(--space-4);
	}

	.fix {
		min-block-size: var(--target);
		padding: 0 var(--space-1);
		border: 0;
		background: transparent;
		color: var(--colour-primary);
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
	}
</style>
