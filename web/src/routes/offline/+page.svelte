<script lang="ts">
	import { onMount } from 'svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import RecipeList from '$lib/components/RecipeList.svelte';
	import { allRecipes } from '$lib/data/tree';
	import { homeHref } from '$lib/links';
	import { recent } from '$lib/stores/recent.svelte';

	let { data } = $props();

	const cards = $derived(new Map(allRecipes(data.index).map((card) => [card.id, card])));
	const viewed = $derived(
		recent.ids.flatMap((id) => {
			const card = cards.get(id);
			return card ? [card] : [];
		})
	);

	onMount(() => recent.load());
</script>

<PageHead
	title="Offline"
	description="This page has not been saved on this device."
	path="offline"
/>

<div class="page">
	<h1>You're offline</h1>
	<p>
		This page has not been saved on this device. Recipes you have opened recently still work without
		a connection.
	</p>
	{#if viewed.length}
		<section aria-labelledby="viewed-title">
			<h2 id="viewed-title">Recently viewed</h2>
			<RecipeList cards={viewed} />
		</section>
	{/if}
	<p><a href={homeHref()}>Back to the home page</a></p>
</div>

<style>
	.page,
	section {
		display: grid;
		gap: var(--space-4);
	}

	.page {
		padding-block: var(--space-5);
	}

	.page > p:first-of-type {
		max-inline-size: var(--measure);
		color: var(--colour-muted);
	}
</style>
