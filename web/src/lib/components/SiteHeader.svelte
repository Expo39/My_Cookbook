<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import {
		favouritesHref,
		homeHref,
		howToHref,
		pageHref,
		searchHref,
		shoppingHref
	} from '$lib/links';
	import { siteTitle } from '$lib/title';
	import Icon from './Icon.svelte';
	import SearchForm from './SearchForm.svelte';

	let {
		sections,
		onsettings
	}: { sections: { title: string; path: string }[]; onsettings: () => void } = $props();

	const here = (href: string) => (page.url.pathname === href ? 'page' : undefined);

	const current = (path: string) => {
		const href = pageHref(path);
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	};

	let list: HTMLUListElement | undefined = $state();
	let before = $state(false);
	let after = $state(false);

	/** Which ends of the sections row have more chips hidden past them. */
	function measure() {
		if (!list) return;
		before = list.scrollLeft > 4;
		after = list.scrollLeft + list.clientWidth < list.scrollWidth - 4;
	}

	let glide: HTMLLIElement | undefined = $state();
	let glides = $state(false);
	let settled = false;

	/**
	 * Slides the highlight to the current section's chip and glides the row to centre it, scrolling the
	 * row only, never the page. The first placement after a load jumps there with no animation.
	 */
	afterNavigate(() => {
		const chip = list?.querySelector<HTMLElement>('a[aria-current="page"]');
		if (list && glide) {
			glides = true;
			glide.classList.toggle('shown', !!chip);
			glide.classList.toggle('instant', !settled);
			if (chip) {
				glide.style.setProperty('--glide-x', `${chip.offsetLeft}px`);
				glide.style.setProperty('--glide-w', `${chip.offsetWidth}px`);
				const smooth = settled && !matchMedia('(prefers-reduced-motion: reduce)').matches;
				list.scrollTo({
					left: chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2,
					behavior: smooth ? 'smooth' : 'auto'
				});
			}
			settled = true;
		}
		measure();
	});
</script>

<svelte:window onresize={measure} />

<header>
	<div class="inner">
		<a class="brand" href={homeHref()}>
			<img class="logo" src="{base}/favicon.svg" alt="" width="28" height="28" />
			<span class="name">{siteTitle}</span>
		</a>
		<div class="tools">
			<div class="desktop-search"><SearchForm compact /></div>
			<a class="icon" href={searchHref()} aria-label="Search recipes">
				<Icon name="search" />
			</a>
			<a
				class="tool"
				href={favouritesHref()}
				aria-label="Favourites"
				aria-current={here(favouritesHref())}
			>
				<Icon name="heart" />
			</a>
			<a
				class="tool"
				href={shoppingHref()}
				aria-label="Shopping list"
				aria-current={here(shoppingHref())}
			>
				<Icon name="basket" />
			</a>
			<a class="tool" href={howToHref()} aria-label="How to use" aria-current={here(howToHref())}>
				<Icon name="help" />
			</a>
			<button class="icon" type="button" aria-label="Settings" onclick={onsettings}>
				<Icon name="sliders" />
			</button>
		</div>
		<nav aria-label="Sections" class:before class:after class:glides>
			<ul bind:this={list} onscroll={measure}>
				<li class="glide" bind:this={glide} aria-hidden="true"></li>
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
		justify-content: center;
		min-inline-size: var(--target);
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
		gap: var(--space-1);
		margin-inline-start: auto;
		order: 1;
	}

	.icon,
	.tool {
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

	.icon:hover,
	.tool:hover,
	.tool[aria-current='page'] {
		background: var(--colour-tint);
	}

	.desktop-search {
		display: none;
	}

	nav {
		order: 2;
		inline-size: 100%;
	}

	/* One row of chips that scrolls sideways on narrow screens, fading at whichever end runs on. */
	ul {
		position: relative;
		display: flex;
		gap: var(--space-2);
		padding-block: var(--space-2);
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}

	.before ul {
		mask-image: linear-gradient(to right, transparent, black 2rem);
	}

	.after ul {
		mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
	}

	.before.after ul {
		mask-image: linear-gradient(
			to right,
			transparent,
			black 2rem,
			black calc(100% - 2rem),
			transparent
		);
	}

	ul::-webkit-scrollbar {
		display: none;
	}

	li {
		flex: none;
	}

	/* One filled pill that slides from chip to chip, so changing section feels like one motion. */
	.glide {
		position: absolute;
		inset-block: var(--space-2);
		inset-inline-start: 0;
		inline-size: var(--glide-w, 0);
		border-radius: var(--radius-pill);
		background: var(--colour-primary);
		opacity: 0;
		transform: translateX(var(--glide-x, 0));
		transition:
			transform var(--duration-panel) var(--ease-out),
			inline-size var(--duration-panel) var(--ease-out),
			opacity var(--duration-micro);
		pointer-events: none;
	}

	.glide:global(.shown) {
		opacity: 1;
	}

	.glide:global(.instant) {
		transition: none;
	}

	nav a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-block-size: var(--target);
		min-inline-size: var(--target);
		padding-inline: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-pill);
		background: var(--colour-surface);
		color: var(--colour-ink);
		font-weight: 700;
		font-size: var(--text-s);
		text-decoration: none;
		transition:
			background-color var(--duration-micro),
			border-color var(--duration-micro),
			color var(--duration-panel),
			transform var(--duration-micro);
	}

	nav a:hover {
		border-color: var(--colour-primary);
		color: var(--colour-primary);
	}

	nav a[aria-current='page'] {
		border-color: var(--colour-primary);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	/* Once the sliding pill is in place, the chip itself goes clear and sits on top of it. */
	.glides a[aria-current='page'] {
		position: relative;
		background: transparent;
	}

	nav a:active {
		transform: scale(0.96);
	}

	.logo {
		flex: none;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		border-radius: var(--radius-s);
	}

	/* Phones show the logo alone; the name stays for screen readers. */
	@media (max-width: 39.99rem) {
		.name {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		.logo {
			inline-size: 2rem;
			block-size: 2rem;
		}

		/* The logo and the four tools share the bar evenly. */
		.tools {
			flex: 1;
			justify-content: space-around;
		}
	}

	@media (min-width: 64rem) {
		.inner {
			flex-wrap: nowrap;
			gap: var(--space-5);
			padding-block: var(--space-3);
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

		ul,
		.before ul,
		.after ul,
		.before.after ul {
			gap: var(--space-4);
			padding-block: 0;
			mask-image: none;
		}

		.glide {
			display: none;
		}

		nav a,
		nav a:hover,
		nav a[aria-current='page'],
		.glides a[aria-current='page'] {
			padding-inline: 0;
			border: 0;
			border-block-end: 2px solid transparent;
			border-radius: 0;
			background: transparent;
			color: var(--colour-ink);
		}

		nav a:hover,
		nav a[aria-current='page'] {
			border-block-end-color: var(--colour-primary);
			color: var(--colour-primary);
		}

		.desktop-search {
			display: block;
		}

		.tools {
			gap: var(--space-2);
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
