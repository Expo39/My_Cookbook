<script lang="ts">
	import { base } from '$app/paths';
	import PageHead from '$lib/components/PageHead.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import SearchForm from '$lib/components/SearchForm.svelte';
	import SectionCard from '$lib/components/SectionCard.svelte';
	import { latestRecipes } from '$lib/data/tree';
	import { siteTitle } from '$lib/title';

	let { data } = $props();

	const subtitle = 'Recipes from a Maltese kitchen by Antonio Galdes, with room for your own';
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
