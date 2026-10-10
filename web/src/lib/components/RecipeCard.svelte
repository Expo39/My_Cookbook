<script lang="ts">
	import { pageHref } from '$lib/links';
	import { photoOf } from '$lib/photo';
	import { formatMinutes } from '$lib/recipe/format';
	import type { RecipeCard } from '$lib/types/recipe';
	import Icon from './Icon.svelte';
	import RecipePhoto from './RecipePhoto.svelte';

	let { card, coverage }: { card: RecipeCard; coverage?: { matched: number; total: number } } =
		$props();

	const total = $derived(card.times.total);
	const photo = $derived(photoOf(card.image));
</script>

<article>
	{#if photo}
		<RecipePhoto id={card.id} {photo} sizes="(min-width: 48rem) 20rem, 90vw" />
	{/if}
	<h3><a href={pageHref(card.id)}>{card.title}</a></h3>
	{#if card.titleLocal}<p class="local">{card.titleLocal}</p>{/if}
	{#if coverage}
		<p class="coverage">
			<progress value={coverage.matched} max={coverage.total}></progress>
			<span class="num">{coverage.matched} of {coverage.total}</span>
			{coverage.total === 1 ? 'ingredient' : 'ingredients'}
		</p>
	{/if}
	<div class="meta">
		{#if total}
			<span class="time"
				><Icon name="clock" size={16} /><span class="num">{formatMinutes(total)}</span></span
			>
		{/if}
		{#each card.tags.slice(0, 2) as tag (tag)}
			<span class="tag">{tag}</span>
		{/each}
	</div>
</article>

<style>
	article {
		position: relative;
		display: grid;
		align-content: start;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		transition: border-color var(--duration-micro);
	}

	article:hover {
		border-color: var(--colour-primary);
	}

	h3 {
		font-size: var(--text-l);
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
	.coverage {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.local {
		font-style: italic;
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
		gap: var(--space-2) var(--space-3);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.time {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.tag {
		padding: 0 var(--space-2);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		font-size: var(--text-xs);
	}
</style>
