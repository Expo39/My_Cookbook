<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import SearchForm from '$lib/components/SearchForm.svelte';
	import SectionCard from '$lib/components/SectionCard.svelte';
	import { latestRecipes } from '$lib/data/tree';
	import { siteTitle } from '$lib/title';

	let { data } = $props();

	const subtitle = "Antonio's recipes from a Maltese kitchen";
</script>

<PageHead title={siteTitle} description={subtitle} path="" />

<div class="home">
	<div class="opening">
		<h1>{siteTitle}</h1>
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
			{#each latestRecipes(data.index, 3) as card (card.id)}
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

	.grid {
		display: grid;
		align-items: start;
		grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
		gap: var(--space-4);
	}

	.recent {
		display: grid;
		gap: var(--space-4);
	}

	@media (min-width: 48rem) {
		.recent {
			grid-template-columns: repeat(3, 1fr);
		}
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
