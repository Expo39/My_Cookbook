<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import BackToTop from '$lib/components/BackToTop.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import TimerStrip from '$lib/components/TimerStrip.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { rememberPage } from '$lib/kitchen/offline';
	import { allRecipes } from '$lib/data/tree';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { personal } from '$lib/stores/personal.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { timers } from '$lib/stores/timers.svelte';

	let { data, children } = $props();

	let drawer: SettingsDrawer;

	afterNavigate(rememberPage);

	onMount(() => {
		theme.load();
		preferences.load();
		timers.load();
		// A shared recipe stays on the device until the deployed cookbook carries its own copy.
		const published = new Set(allRecipes(data.index).map((card) => card.id));
		void personal.load().then(() => personal.forgetPublished(published));
	});
</script>

<a class="skip" href="#main">Skip to content</a>
{#if !chrome.cooking}<TimerStrip />{/if}
<OfflineBanner />
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
