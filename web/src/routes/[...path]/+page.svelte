<script lang="ts">
	import RecipeView from '$lib/components/RecipeView.svelte';
	import SectionView from '$lib/components/SectionView.svelte';

	let { data } = $props();
</script>

{#if data.kind === 'section'}
	<SectionView section={data.section} index={data.index} />
{:else}
	<!-- A new version of the same recipe is a new object, so the view starts afresh from it. -->
	{#key data.recipe}
		<RecipeView card={data.card} data={data.recipe} index={data.index} />
	{/key}
{/if}
