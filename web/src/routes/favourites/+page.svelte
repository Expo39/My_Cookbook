<script lang="ts">
	import { onMount } from 'svelte';
	import CardGhosts from '$lib/components/CardGhosts.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import RecipeList from '$lib/components/RecipeList.svelte';
	import { localCards } from '$lib/data/local-card';
	import { allRecipes } from '$lib/data/tree';
	import { favourites } from '$lib/stores/favourites.svelte';
	import { personal } from '$lib/stores/personal.svelte';
	import { recent } from '$lib/stores/recent.svelte';
	import type { RecipeCard } from '$lib/types/recipe';

	let { data } = $props();

	/** The cookbook's own copy wins once a shared recipe is published. */
	const own = $derived(
		localCards(
			data.index,
			personal.list.filter((entry) => !entry.shared)
		)
	);
	const local = $derived(new Set(own.map((card) => card.id)));
	const cards = $derived(
		new Map([...own, ...allRecipes(data.index)].map((card) => [card.id, card]))
	);
	const pick = (ids: string[]) =>
		ids.flatMap((id) => {
			const card = cards.get(id);
			return card ? [card] : [];
		});
	const saved = $derived<RecipeCard[]>(pick([...favourites.ids].reverse()));
	const viewed = $derived<RecipeCard[]>(pick(recent.ids));

	let ready = $state(false);

	onMount(() => {
		favourites.load();
		recent.load();
		void personal.load().then(() => (ready = true));
	});
</script>

<PageHead
	title="Favourites"
	description="The recipes you have saved, and the ones you opened most recently."
	path="favourites"
/>

<div class="page">
	<h1>Favourites</h1>

	<section aria-labelledby="saved-title">
		<h2 id="saved-title">Saved</h2>
		{#if ready && saved.length}
			<RecipeList cards={saved} {local} />
		{:else}
			{#if !ready}<CardGhosts list="favourites" />{/if}
			<p class="empty" data-ghost-empty={ready ? undefined : 'favourites'}>
				No favourites yet. Choose Favourite on a recipe to keep it here.
			</p>
		{/if}
	</section>

	<section aria-labelledby="viewed-title">
		<h2 id="viewed-title">Recently viewed</h2>
		{#if ready && viewed.length}
			<RecipeList cards={viewed} {local} />
		{:else}
			{#if !ready}<CardGhosts list="recent" />{/if}
			<p class="empty" data-ghost-empty={ready ? undefined : 'recent'}>
				Recipes you open will appear here.
			</p>
		{/if}
	</section>
</div>

<style>
	.page,
	section {
		display: grid;
		gap: var(--space-4);
	}

	.page {
		gap: var(--space-6);
	}

	.empty {
		color: var(--colour-muted);
	}
</style>
