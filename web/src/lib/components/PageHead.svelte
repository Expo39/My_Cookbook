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
		image?: { url: string; width: number; height: number; alt: string };
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
	{#if image}
		<meta property="og:image" content={image.url} />
		<meta property="og:image:width" content={String(image.width)} />
		<meta property="og:image:height" content={String(image.height)} />
		<meta property="og:image:alt" content={image.alt} />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content={image.url} />
		<meta name="twitter:image:alt" content={image.alt} />
	{:else}
		<meta name="twitter:card" content="summary" />
	{/if}
</svelte:head>
