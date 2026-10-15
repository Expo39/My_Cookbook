<script lang="ts">
	import { pageHref } from '$lib/links';
	import { photoOf } from '$lib/photo';
	import { formatMinutes, servingsText } from '$lib/recipe/format';
	import type { RecipeCard } from '$lib/types/recipe';
	import Icon from './Icon.svelte';
	import RecipePhoto from './RecipePhoto.svelte';

	let {
		card,
		coverage,
		showSection = true
	}: {
		card: RecipeCard;
		coverage?: { matched: number; total: number };
		/** Off where the page heading already names the section. */
		showSection?: boolean;
	} = $props();

	const total = $derived(card.times.total);
	const photo = $derived(photoOf(card.image));
	const where = $derived(showSection ? card.section.at(-1) : undefined);
</script>

<article>
	<div class="card" class:photo>
		{#if photo}
			<RecipePhoto id={card.id} {photo} sizes="(min-width: 48rem) 20rem, 90vw" />
		{/if}
		<div class="body">
			{#if where}<p class="where">{where}</p>{/if}
			<h3><a href={pageHref(card.id)}>{card.title}</a></h3>
			{#if card.titleLocal}<p class="local">{card.titleLocal}</p>{/if}
			{#if card.summary}<p class="summary">{card.summary}</p>{/if}
			{#if coverage}
				<p class="coverage">
					<progress value={coverage.matched} max={coverage.total}></progress>
					<span class="num">{coverage.matched} of {coverage.total}</span>
					{coverage.total === 1 ? 'ingredient' : 'ingredients'}
				</p>
			{/if}
		</div>
		<div class="meta">
			{#if total}
				<span class="fact"
					><Icon name="clock" size={16} /><span class="num">{formatMinutes(total)}</span></span
				>
			{/if}
			<span class="fact"
				><Icon name="users" size={16} /><span class="num">{servingsText(card.servings)}</span></span
			>
			{#each card.tags.slice(0, 2) as tag (tag)}
				<span class="tag">{tag}</span>
			{/each}
		</div>
	</div>
</article>

<style>
	article {
		position: relative;
		container-type: inline-size;
		block-size: 100%;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		overflow: hidden;
		transition:
			border-color var(--duration-micro),
			transform var(--duration-micro) var(--ease-out);
	}

	/* Rows: optional photo, the text (which takes the slack), then the meta pinned to the bottom. */
	.card {
		display: grid;
		grid-template-rows: 1fr auto;
		block-size: 100%;
	}

	.photo {
		grid-template-rows: auto 1fr auto;
	}

	.photo :global(picture) {
		border-radius: 0;
	}

	article:hover {
		border-color: var(--colour-primary);
	}

	.body {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-4) var(--space-3);
	}

	.where {
		color: var(--colour-accent);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h3 {
		display: -webkit-box;
		overflow: hidden;
		font-size: clamp(var(--text-l), 6cqi, var(--text-xl));
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	/* One link per card, stretched over the whole card so it stays a single tab stop. */
	a {
		text-decoration: none;
	}

	a::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--radius-m);
	}

	a:focus-visible {
		outline: none;
	}

	a:focus-visible::after {
		outline: 2px solid var(--colour-primary);
		outline-offset: 2px;
	}

	.local,
	.summary,
	.coverage {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.local {
		font-style: italic;
	}

	.summary {
		display: -webkit-box;
		overflow: hidden;
		line-height: 1.5;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.coverage {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	progress {
		appearance: none;
		inline-size: 6rem;
		block-size: 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
		overflow: hidden;
	}

	progress::-webkit-progress-bar {
		background: var(--colour-tint);
	}

	progress::-webkit-progress-value {
		background: var(--colour-primary);
	}

	progress::-moz-progress-bar {
		background: var(--colour-primary);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-block-start: 1px dashed var(--colour-line);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.fact {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.tag {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
		color: var(--colour-primary);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	/* Wide cards (one per row on a tablet) put the photo beside the text. */
	@container (min-width: 34rem) {
		.photo {
			grid-template-columns: 40% 1fr;
			grid-template-rows: 1fr auto;
		}

		.photo :global(picture) {
			grid-row: 1 / -1;
			block-size: 100%;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		article:hover {
			transform: translateY(-2px);
		}
	}
</style>
