<script lang="ts">
	import { countRecipes } from '$lib/data/tree';
	import { pageHref } from '$lib/links';
	import { recipesText } from '$lib/recipe/format';
	import type { SectionNode } from '$lib/types/recipe';

	let { section }: { section: SectionNode } = $props();
</script>

<article>
	<div class="head">
		<h3><a href={pageHref(section.path)}>{section.title}</a></h3>
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
					<a href={pageHref(child.path)}>{child.title}</a>
					<span class="num">{countRecipes(child)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</article>

<style>
	article {
		container-type: inline-size;
		display: grid;
		align-content: start;
		gap: var(--space-2);
		block-size: 100%;
		padding: var(--space-5);
		border: 1px solid var(--colour-line);
		border-block-start: 4px solid var(--colour-primary);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		transition: border-color var(--duration-micro);
	}

	article:hover {
		border-color: var(--colour-primary);
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

	h3 a {
		text-decoration: none;
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
		display: grid;
		margin-block-start: var(--space-2);
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		border-block-start: 1px dashed var(--colour-line);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	li a {
		display: inline-flex;
		align-items: center;
		flex: 1;
		min-block-size: var(--target);
		font-weight: 700;
	}
</style>
