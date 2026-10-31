<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import PageHead from '$lib/components/PageHead.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
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

	/** Tappable examples, so the ways to search are shown rather than described. */
	const EXAMPLES: Record<Mode, { query: string; meaning: string }[]> = {
		recipes: [
			{ query: 'katsu', meaning: 'a dish by its name' },
			{ query: 'mushroom', meaning: 'every recipe with an ingredient' },
			{ query: 'pasta tomato', meaning: 'recipes with both words' },
			{ query: 'italian', meaning: 'a kind of dish, such as Italian Classics' },
			{ query: 'brulee', meaning: 'accents and small typos do not matter' }
		],
		have: [
			{ query: 'eggs, flour, milk', meaning: 'what is in your kitchen, with commas between' },
			{ query: 'chicken, rice, onion', meaning: 'recipes you can nearly make come first' }
		]
	};

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
			<div class="label-row">
				<label for="{id}-query">
					{mode === 'have' ? 'Ingredients you have' : 'Search recipes'}
				</label>
				<InfoTip
					topic="searching"
					text={mode === 'have'
						? 'List what you have, with commas between, such as "eggs, flour, milk". Recipes that need the fewest other things come first, with how many of their ingredients you have.'
						: 'Type a name, an ingredient or a kind of dish. Several words find recipes with all of them. For a list of what you have, choose "I have these ingredients".'}
				/>
			</div>
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
					: 'A name, an ingredient or a kind of dish.'}
			</p>
		</div>
	</form>

	<noscript><p class="help">Search needs JavaScript to run in your browser.</p></noscript>

	<section aria-live="polite">
		{#if failed}
			<p class="status">Search could not load. Reload the page to try again.</p>
		{:else if !searching}
			{#if !synced}<p class="status waiting">Loading search...</p>{/if}
			<div class="guide" data-query-hidden={synced ? undefined : ''}>
				<h2 class="label">How to search</h2>
				<ul>
					{#each EXAMPLES[mode] as example (example.query)}
						<li>
							<button type="button" class="example" onclick={() => (query = example.query)}>
								{example.query}
							</button>
							<span>{example.meaning}</span>
						</li>
					{/each}
				</ul>
			</div>
		{:else if !engine}
			<p class="status">Loading search...</p>
		{:else}
			{#if mode === 'recipes' && query.includes(',')}
				<p class="status switch">
					Looks like a list of ingredients. Search by what you have to find recipes that use them.
					<button type="button" class="example" onclick={() => (mode = 'have')}>
						Search by ingredients
					</button>
				</p>
			{/if}
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

	/* Before the code runs, a query in the address (seen by the script in app.html) means results
	   are coming, so the help is not shown first. */
	.waiting {
		display: none;
	}

	:global(html[data-query]) .waiting {
		display: block;
	}

	:global(html[data-query]) .guide[data-query-hidden] {
		display: none;
	}

	ul {
		display: grid;
		grid-template-columns: var(--card-grid);
		gap: var(--space-4);
	}

	.label-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.guide {
		display: grid;
		gap: var(--space-3);
		max-inline-size: 40rem;
		padding: var(--space-4);
		border-radius: var(--radius-m);
		background: var(--colour-tint);
	}

	.guide .label {
		color: var(--colour-primary);
	}

	/* Two aligned columns, the example and what it shows, on every screen size. */
	.guide ul {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.guide li {
		display: contents;
	}

	.guide span {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	/* Each example is a chip that fills the box, so trying it is one tap. */
	.example {
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-pill);
		background: var(--colour-surface);
		color: var(--colour-primary);
		font-weight: 700;
	}

	.switch {
		display: grid;
		justify-items: start;
		gap: var(--space-2);
	}

	.example:hover {
		border-color: var(--colour-primary);
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
