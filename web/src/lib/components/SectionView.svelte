<script lang="ts">
	import { onMount } from 'svelte';
	import { localCards } from '$lib/data/local-card';
	import { countRecipes, descendantRecipes, sectionTrail } from '$lib/data/tree';
	import { editHref, homeHref, pageHref } from '$lib/links';
	import { personal } from '$lib/stores/personal.svelte';
	import CardGhosts from './CardGhosts.svelte';
	import Icon from './Icon.svelte';
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
	/** Recipes added on this device that sit in this section or below it. */
	const mine = $derived(
		localCards(
			index,
			personal.list.filter(
				(entry) =>
					!entry.shared && (entry.id.startsWith(`${section.path}/`) || entry.id === section.path)
			)
		)
	);

	onMount(() => void personal.load());
	const description = $derived(
		section.summary ?? `${section.title}: ${count} ${recipesText(count)} from a Maltese kitchen.`
	);
</script>

<PageHead title={section.title} {description} path={section.path} />

<div class="page">
	<Breadcrumb {trail} />
	<header>
		<h1>{section.title}</h1>
		{#if section.summary}<p class="summary">{section.summary}</p>{/if}
		<p class="count"><span class="num">{count}</span> {recipesText(count)}</p>
		<a class="add" href={editHref({ section: section.path })}>
			<Icon name="plus" size={18} />Add a recipe here
		</a>
	</header>

	{#if mine.length}
		<section aria-labelledby="mine-here">
			<h2 id="mine-here">Your recipes</h2>
			<ul class="grid">
				{#each mine as card (card.id)}
					<li><RecipeCard {card} local /></li>
				{/each}
			</ul>
		</section>
	{:else if !personal.loaded}
		<!-- Shown, with its heading, only while this browser's recipes for the section are read. -->
		<section class="waiting" data-ghost-show="mine" aria-hidden="true">
			<h2>Your recipes</h2>
			<CardGhosts list="mine" />
		</section>
	{/if}

	{#if section.recipes.length}
		<ul class="grid">
			{#each section.recipes as card (card.id)}
				<li><RecipeCard {card} showSection={false} /></li>
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
					<li><RecipeCard {card} showSection={false} /></li>
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

	.waiting {
		display: none;
	}

	header {
		gap: var(--space-2);
	}

	.add {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-2);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 1px dashed var(--colour-primary);
		border-radius: var(--radius-s);
		color: var(--colour-primary);
		font-weight: 700;
		text-decoration: none;
	}

	.add:hover {
		background: var(--colour-tint);
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
		grid-template-columns: var(--card-grid);
		gap: var(--space-4);
	}
</style>
