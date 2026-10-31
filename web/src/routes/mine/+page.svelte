<script lang="ts">
	import { onMount } from 'svelte';
	import RecipeView from '$lib/components/RecipeView.svelte';
	import { loadCore, scaleRecipe } from '$lib/core';
	import { localCard, localData } from '$lib/data/local-card';
	import { homeHref } from '$lib/links';
	import { personal } from '$lib/stores/personal.svelte';
	import type { RecipeCard, RecipeData } from '$lib/types/recipe';

	let { data } = $props();

	let shown = $state.raw<{ card: RecipeCard; data: RecipeData } | null>(null);
	let missing = $state(false);

	// A recipe on this device has no page of its own, so it is read and scaled here in the browser.
	onMount(async () => {
		const id = new URLSearchParams(location.search).get('id') ?? '';
		await Promise.all([personal.load(), loadCore()]);
		const entry = personal.get(id);
		if (!entry) {
			missing = true;
			return;
		}
		shown = {
			card: localCard(data.index, entry.id, entry.recipe),
			data: localData(data.index, entry.id, entry.recipe, scaleRecipe(entry.recipe))
		};
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if shown}
	{#key shown.card.id}
		<RecipeView card={shown.card} data={shown.data} index={data.index} local />
	{/key}
{:else if missing}
	<section class="missing">
		<h1>That recipe is not on this device</h1>
		<p>
			Recipes you add are kept in this browser only. It may have been cleared, or added on another
			device.
		</p>
		<a href={homeHref()}>Back to the cookbook</a>
	</section>
{:else}
	<p class="opening" role="status">Opening your recipe...</p>
{/if}

<style>
	.opening {
		min-block-size: 70dvh;
		color: var(--colour-muted);
	}

	.missing {
		display: grid;
		gap: var(--space-3);
		max-inline-size: var(--measure);
	}
</style>
