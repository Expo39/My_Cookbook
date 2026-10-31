<script lang="ts">
	import { countRecipes } from '$lib/data/tree';
	import { pageHref } from '$lib/links';
	import { recipesText } from '$lib/recipe/format';
	import type { SectionNode } from '$lib/types/recipe';
	import Icon from './Icon.svelte';

	let { section }: { section: SectionNode } = $props();
</script>

<article>
	<div class="head">
		<h3>
			<a class="open" href={pageHref(section.path)}
				>{section.title}<Icon name="chevronRight" size={22} /></a
			>
		</h3>
		<p class="count">
			<span class="num">{countRecipes(section)}</span>
			{recipesText(countRecipes(section))}
		</p>
	</div>
	{#if section.summary}<p class="summary">{section.summary}</p>{/if}
	{#if section.sections.length}
		<ul>
			{#each section.sections as child (child.path)}
				<li>
					<a href={pageHref(child.path)}>
						<span class="title">{child.title}</span>
						<span class="num">{countRecipes(child)}</span>
						<Icon name="chevronRight" size={16} />
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="browse">
			Browse <span class="num">{countRecipes(section)}</span>
			{recipesText(countRecipes(section))}
		</p>
	{/if}
</article>

<style>
	/* The whole card opens the section; the subsection rows sit above that link as their own targets. */
	article {
		position: relative;
		container-type: inline-size;
		display: grid;
		grid-template-rows: auto auto 1fr;
		gap: var(--space-2);
		block-size: 100%;
		padding: var(--space-5);
		border: 1px solid var(--colour-line);
		border-block-start: 4px solid var(--colour-primary);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		transition:
			border-color var(--duration-micro),
			box-shadow var(--duration-micro),
			transform var(--duration-micro) var(--ease-out);
	}

	article:hover {
		border-color: var(--colour-primary);
		box-shadow: var(--shadow-float);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}

	h3 {
		font-size: clamp(var(--text-xl), 9cqi, var(--text-2xl));
	}

	.open {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		text-decoration: none;
	}

	.open::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--radius-m);
	}

	.open :global(svg) {
		transition: transform var(--duration-micro) var(--ease-out);
	}

	article:hover .open :global(svg) {
		transform: translateX(3px);
	}

	article:hover .open {
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.open:focus-visible {
		outline: none;
	}

	.open:focus-visible::after {
		outline: 2px solid var(--colour-primary);
		outline-offset: 2px;
	}

	.count {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
		color: var(--colour-primary);
		font-size: var(--text-xs);
		font-weight: 700;
		white-space: nowrap;
	}

	.summary {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	ul {
		position: relative;
		z-index: 1;
		display: grid;
		align-content: start;
		margin-block-start: var(--space-2);
	}

	li {
		border-block-start: 1px dashed var(--colour-line);
	}

	li a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-block-size: var(--target);
		margin-inline: calc(-1 * var(--space-2));
		padding-inline: var(--space-2);
		border-radius: var(--radius-s);
		color: var(--colour-ink);
		font-size: var(--text-s);
		font-weight: 700;
		text-decoration: none;
		transition: background-color var(--duration-micro);
	}

	.title {
		flex: 1;
	}

	li .num {
		color: var(--colour-muted);
	}

	li a :global(svg) {
		color: var(--colour-muted);
		transition: transform var(--duration-micro) var(--ease-out);
	}

	li a:hover {
		background: var(--colour-tint);
		color: var(--colour-primary);
	}

	li a:hover :global(svg) {
		color: var(--colour-primary);
		transform: translateX(2px);
	}

	.browse {
		align-self: end;
		color: var(--colour-primary);
		font-size: var(--text-s);
		font-weight: 700;
	}

	@media (prefers-reduced-motion: no-preference) {
		article:hover {
			transform: translateY(-2px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.open :global(svg),
		li a :global(svg) {
			transition: none;
		}

		article:hover .open :global(svg),
		li a:hover :global(svg) {
			transform: none;
		}
	}
</style>
