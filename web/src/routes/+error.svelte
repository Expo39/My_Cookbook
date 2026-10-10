<script lang="ts">
	import { page } from '$app/state';
	import PageHead from '$lib/components/PageHead.svelte';
	import SearchForm from '$lib/components/SearchForm.svelte';
	import { homeHref } from '$lib/links';

	const missing = $derived(page.status === 404);
</script>

<PageHead
	title={missing ? 'Page not found' : 'Something went wrong'}
	description="This page is not in the cookbook."
	path=""
/>

<div class="page">
	<h1>{missing ? 'That page is not in the cookbook' : 'Something went wrong'}</h1>
	<p>
		{missing
			? 'The address may be mistyped, or the recipe may have moved. Search for it, or start from the home page.'
			: (page.error?.message ?? 'Please try again in a moment.')}
	</p>
	<div class="search"><SearchForm /></div>
	<p><a href={homeHref()}>Back to the home page</a></p>
</div>

<style>
	.page {
		display: grid;
		gap: var(--space-4);
		max-inline-size: 40rem;
		padding-block: var(--space-5);
	}

	.page p:first-of-type {
		color: var(--colour-muted);
	}
</style>
