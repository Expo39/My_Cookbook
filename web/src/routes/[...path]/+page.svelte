<script lang="ts">
	import RecipeView from '$lib/components/RecipeView.svelte';
	import SectionView from '$lib/components/SectionView.svelte';

	let { data } = $props();
</script>

{#if data.kind === 'section'}
	<SectionView section={data.section} index={data.index} />
{:else}
	{#key data.card.id}
		<RecipeView card={data.card} data={data.recipe} index={data.index} />
	{/key}
{/if}
