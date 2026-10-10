<script lang="ts">
	import { countRecipes, descendantRecipes, sectionTrail } from '$lib/data/tree';
	import { homeHref, pageHref } from '$lib/links';
	import { recipesText } from '$lib/recipe/format';
	import type { SectionNode, SiteIndex } from '$lib/types/recipe';
	import Breadcrumb from './Breadcrumb.svelte';
	import PageHead from './PageHead.svelte';
	import RecipeCard from './RecipeCard.svelte';

	let { section, index }: { section: SectionNode; index: SiteIndex } = $props();

	const trail = $derived([
		{ label: 'Home', href: homeHref() },
		...sectionTrail(index, section.path).map((node) => ({
			label: node.title,
			href: node.path === section.path ? undefined : pageHref(node.path)
		}))
	]);
	const count = $derived(countRecipes(section));
	const description = $derived(
		section.summary ?? `${section.title}: ${count} ${recipesText(count)} from Antonio's kitchen.`
	);
</script>

<PageHead title={section.title} {description} path={section.path} />

<div class="page">
	<Breadcrumb {trail} />
	<header>
		<h1>{section.title}</h1>
		{#if section.summary}<p class="summary">{section.summary}</p>{/if}
		<p class="count"><span class="num">{count}</span> {recipesText(count)}</p>
	</header>

	{#if section.recipes.length}
		<ul class="grid">
			{#each section.recipes as card (card.id)}
				<li><RecipeCard {card} /></li>
			{/each}
		</ul>
	{/if}

	{#each section.sections as child (child.path)}
		<section aria-labelledby={`sub-${child.path}`}>
			<h2 id={`sub-${child.path}`}>
				<a href={pageHref(child.path)}>{child.title}</a>
				<span class="count num">{countRecipes(child)}</span>
			</h2>
			{#if child.summary}<p class="summary">{child.summary}</p>{/if}
			<ul class="grid">
				{#each descendantRecipes(child) as card (card.id)}
					<li><RecipeCard {card} /></li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.page,
	section,
	header {
		display: grid;
		gap: var(--space-4);
	}

	.page {
		gap: var(--space-5);
	}

	header {
		gap: var(--space-2);
	}

	.summary,
	.count {
		color: var(--colour-muted);
	}

	.summary {
		max-inline-size: var(--measure);
		font-size: var(--text-l);
	}

	h2 {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	h2 a {
		text-decoration: none;
	}

	h2 .count {
		font-size: var(--text-s);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr));
		gap: var(--space-4);
	}
</style>
