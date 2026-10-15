<script lang="ts">
	import type { RecipeCard as Card } from '$lib/types/recipe';
	import RecipeCard from './RecipeCard.svelte';

	let { cards }: { cards: Card[] } = $props();
</script>

<ul>
	{#each cards as card (card.id)}
		<li><RecipeCard {card} /></li>
	{/each}
</ul>

<style>
	ul {
		display: grid;
		grid-template-columns: var(--card-grid);
		gap: var(--space-4);
	}
</style>
