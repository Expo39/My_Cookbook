<script lang="ts">
	import type { RecipeCard as Card } from '$lib/types/recipe';
	import RecipeCard from './RecipeCard.svelte';

	/** `local` holds the ids of recipes added on this device, which open from the browser's copy. */
	let { cards, local }: { cards: Card[]; local?: Set<string> } = $props();
</script>

<ul>
	{#each cards as card (card.id)}
		<li><RecipeCard {card} local={local?.has(card.id)} /></li>
	{/each}
</ul>

<style>
	ul {
		display: grid;
		grid-template-columns: var(--card-grid);
		gap: var(--space-4);
	}
</style>
