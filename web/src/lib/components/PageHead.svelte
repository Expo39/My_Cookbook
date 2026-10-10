<script lang="ts">
	import { canonicalUrl } from '$lib/seo/site';
	import { siteTitle } from '$lib/title';

	let {
		title,
		description,
		path,
		image,
		type = 'website'
	}: {
		title: string;
		description: string;
		/** The page's path below the base, without a leading slash; empty for the home page. */
		path: string;
		image?: string;
		type?: 'website' | 'article';
	} = $props();

	const full = $derived(title === siteTitle ? title : `${title} | ${siteTitle}`);
	const url = $derived(canonicalUrl(path));
</script>

<svelte:head>
	<title>{full}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:site_name" content={siteTitle} />
	<meta property="og:type" content={type} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	{#if image}<meta property="og:image" content={image} />{/if}
</svelte:head>
