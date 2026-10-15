<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import SearchForm from '$lib/components/SearchForm.svelte';
	import SectionCard from '$lib/components/SectionCard.svelte';
	import { localCards } from '$lib/data/local-card';
	import { latestRecipes } from '$lib/data/tree';
	import { editHref } from '$lib/links';
	import { personal } from '$lib/stores/personal.svelte';
	import { siteTitle } from '$lib/title';

	let { data } = $props();

	const subtitle = 'Recipes from a Maltese kitchen by Antonio Galdes, with room for your own';

	let hydrated = $state(false);
	const mine = $derived(
		localCards(
			data.index,
			personal.list.filter((entry) => !entry.shared)
		)
	);

	onMount(() => {
		void personal.load().then(() => (hydrated = true));
	});
</script>

<PageHead title={siteTitle} description={subtitle} path="" />

<div class="home">
	<div class="opening">
		<h1><img src="{base}/favicon.svg" alt="" width="56" height="56" />{siteTitle}</h1>
		<p class="subtitle">{subtitle}</p>
	</div>
	<div class="search"><SearchForm /></div>

	<section aria-labelledby="sections-title">
		<h2 id="sections-title" class="sr-only">Sections</h2>
		<div class="grid">
			{#each data.index.sections as section (section.path)}
				<SectionCard {section} />
			{/each}
		</div>
	</section>

	{#if hydrated}
		<section aria-labelledby="mine-title">
			<div class="heading">
				<h2 id="mine-title">Your recipes</h2>
				<a class="add" href={editHref()}><Icon name="plus" size={18} />Add a recipe</a>
			</div>
			{#if mine.length}
				<div class="recent">
					{#each mine as card (card.id)}
						<RecipeCard {card} local />
					{/each}
				</div>
			{:else}
				<p class="invite">
					Add your own recipes and cook from them here. They are kept in this browser, so only you
					see them.
				</p>
			{/if}
		</section>
	{/if}

	<section aria-labelledby="recent-title">
		<h2 id="recent-title">Recently added</h2>
		<div class="recent">
			{#each latestRecipes(data.index, 4) as card (card.id)}
				<RecipeCard {card} />
			{/each}
		</div>
	</section>
</div>

<style>
	.home {
		display: grid;
		gap: var(--space-6);
	}

	.opening {
		display: grid;
		gap: var(--space-2);
		padding-block-start: var(--space-4);
	}

	h1 {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	h1 img {
		flex: none;
		inline-size: 0.9em;
		block-size: 0.9em;
		border-radius: var(--radius-m);
	}

	.subtitle {
		color: var(--colour-muted);
		font-size: var(--text-l);
	}

	.search {
		max-inline-size: 40rem;
	}

	section {
		display: grid;
		gap: var(--space-4);
	}

	.heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
	}

	.add {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border-radius: var(--radius-s);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-weight: 700;
		text-decoration: none;
	}

	.invite {
		padding: var(--space-4);
		border: 1px dashed var(--colour-line);
		border-radius: var(--radius-m);
		color: var(--colour-muted);
	}

	.grid,
	.recent {
		display: grid;
		grid-template-columns: var(--card-grid);
		gap: var(--space-4);
	}

	@media (max-width: 47.99rem) {
		.search {
			position: sticky;
			inset-block-start: env(safe-area-inset-top, 0px);
			z-index: 4;
			margin-inline: calc(-1 * var(--gutter));
			padding: var(--space-2) var(--gutter);
			background: var(--colour-bg);
			border-block-end: 1px solid var(--colour-line);
		}
	}
</style>
