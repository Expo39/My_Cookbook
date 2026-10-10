<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import { onMount } from 'svelte';
	import BackToTop from '$lib/components/BackToTop.svelte';
	import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { theme } from '$lib/stores/theme.svelte';

	let { data, children } = $props();

	let drawer: SettingsDrawer;

	onMount(() => {
		theme.load();
		preferences.load();
	});
</script>

<a class="skip" href="#main">Skip to content</a>
<SiteHeader
	sections={data.index.sections.map(({ title, path }) => ({ title, path }))}
	onsettings={() => drawer.show()}
/>
<main id="main" tabindex="-1">
	{@render children()}
</main>
<SiteFooter />
<SettingsDrawer bind:this={drawer} />
<BackToTop />
<Toast />

<style>
	.skip {
		position: absolute;
		inset-block-start: var(--space-2);
		inset-inline-start: var(--space-2);
		z-index: 40;
		padding: var(--space-3) var(--space-4);
		min-block-size: var(--target);
		border-radius: var(--radius-s);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-weight: 700;
		transform: translateY(-200%);
	}

	.skip:focus-visible {
		transform: none;
	}

	main {
		display: block;
		max-inline-size: var(--page-max);
		margin-inline: auto;
		padding: var(--space-5) var(--gutter) 0;
	}

	main:focus {
		outline: none;
	}

	@media print {
		.skip {
			display: none;
		}

		main {
			padding: 0;
		}
	}
</style>
