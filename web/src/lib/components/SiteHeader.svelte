<script lang="ts">
	import { page } from '$app/state';
	import { homeHref, pageHref, searchHref } from '$lib/links';
	import { siteTitle } from '$lib/title';
	import Icon from './Icon.svelte';
	import SearchForm from './SearchForm.svelte';

	let {
		sections,
		onsettings
	}: { sections: { title: string; path: string }[]; onsettings: () => void } = $props();

	const current = (path: string) => {
		const href = pageHref(path);
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	};
</script>

<header>
	<div class="inner">
		<a class="brand" href={homeHref()}>
			<Icon name="hat" size={26} />
			<span>{siteTitle}</span>
		</a>
		<div class="tools">
			<div class="desktop-search"><SearchForm compact /></div>
			<a class="icon" href={searchHref()} aria-label="Search recipes">
				<Icon name="search" />
			</a>
			<button class="icon" type="button" aria-label="Settings" onclick={onsettings}>
				<Icon name="sliders" />
			</button>
		</div>
		<nav aria-label="Sections">
			<ul>
				{#each sections as section (section.path)}
					<li>
						<a
							href={pageHref(section.path)}
							aria-current={current(section.path) ? 'page' : undefined}>{section.title}</a
						>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</header>

<style>
	header {
		border-block-end: 1px solid var(--colour-line);
	}

	.inner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0 var(--space-4);
		max-inline-size: var(--page-max);
		margin-inline: auto;
		padding: env(safe-area-inset-top, 0px) var(--gutter) 0;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		color: var(--colour-primary);
		font-family: var(--font-display);
		font-size: var(--text-l);
		font-weight: 800;
		letter-spacing: 0.005em;
		text-decoration: none;
	}

	.tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-inline-start: auto;
		order: 1;
	}

	.icon {
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		background: transparent;
		color: var(--colour-primary);
	}

	.icon:hover {
		background: var(--colour-tint);
	}

	.desktop-search {
		display: none;
	}

	nav {
		order: 2;
		inline-size: 100%;
	}

	/* One row that scrolls sideways on narrow screens, with a fade where it runs on. */
	ul {
		display: flex;
		column-gap: var(--space-4);
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
	}

	ul::-webkit-scrollbar {
		display: none;
	}

	li {
		flex: none;
		scroll-snap-align: start;
	}

	nav a {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--target);
		min-inline-size: var(--target);
		justify-content: center;
		color: var(--colour-ink);
		font-weight: 700;
		font-size: var(--text-s);
		text-decoration: none;
		border-block-end: 2px solid transparent;
	}

	nav a:hover,
	nav a[aria-current='page'] {
		color: var(--colour-primary);
		border-block-end-color: var(--colour-primary);
	}

	@media (min-width: 64rem) {
		.inner {
			flex-wrap: nowrap;
			gap: var(--space-5);
		}

		.tools {
			order: 0;
			margin-inline-start: 0;
		}

		nav {
			flex: 1;
			order: 0;
			inline-size: auto;
		}

		ul {
			mask-image: none;
		}

		.desktop-search {
			display: block;
		}

		.icon[href] {
			display: none;
		}
	}

	@media print {
		header {
			display: none;
		}
	}
</style>
