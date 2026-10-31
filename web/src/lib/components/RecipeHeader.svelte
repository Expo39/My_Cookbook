<script lang="ts">
	import { photoOf } from '$lib/photo';
	import { formatMinutes, servingsText } from '$lib/recipe/format';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { favourites } from '$lib/stores/favourites.svelte';
	import type { RecipeCard } from '$lib/types/recipe';
	import Icon from './Icon.svelte';
	import PhotoSlot from './PhotoSlot.svelte';
	import RecipePhoto from './RecipePhoto.svelte';

	let {
		card,
		model,
		hydrated,
		cookHref,
		onshare,
		onaddlist,
		onask,
		edithref,
		photoToGitHub = false,
		photoTools = true
	}: {
		card: RecipeCard;
		model: RecipeModel;
		hydrated: boolean;
		cookHref: string;
		/** Absent for a recipe that has no public page to share. */
		onshare?: () => void;
		onaddlist: () => void;
		onask?: () => void;
		edithref?: string;
		/** Editing is unlocked and the recipe is the cookbook's, so a photo is committed to GitHub. */
		photoToGitHub?: boolean;
		/** Off in the editor's preview, where the photo is chosen in its own Photo section. */
		photoTools?: boolean;
	} = $props();

	const recipe = $derived(model.data.recipe);
	const times = $derived(card.times);
	const photo = $derived(photoOf(card.image));
	const saved = $derived(favourites.has(card.id));
	const timings = $derived(
		[
			['Prep', times.prep],
			['Cook', times.cook],
			['Rest', times.rest],
			['Total', times.total]
		].filter((entry): entry is [string, number] => typeof entry[1] === 'number')
	);
</script>

<header>
	{#if photoTools}
		<PhotoSlot id={card.id} title={recipe.title} {photo} toGitHub={photoToGitHub} />
	{:else if photo}
		<RecipePhoto id={card.id} {photo} sizes="(min-width: 64rem) 40rem, 100vw" />
	{/if}
	<div class="text">
		<div class="titles">
			<h1>{recipe.title}</h1>
			{#if recipe.titleLocal}<p class="local">{recipe.titleLocal}</p>{/if}
			<p class="summary">{recipe.summary}</p>
		</div>

		<dl class="meta">
			{#each timings as [label, minutes] (label)}
				<div>
					<dt class="label">{label}</dt>
					<dd class="num">{formatMinutes(minutes)}</dd>
				</div>
			{/each}
			{#if recipe.difficulty}
				<div>
					<dt class="label">Difficulty</dt>
					<dd class="difficulty">{recipe.difficulty}</dd>
				</div>
			{/if}
			<div>
				<dt class="label">Serves</dt>
				<dd class="num serves">{servingsText(model.view.servings, recipe.servingsNoun)}</dd>
			</div>
		</dl>

		{#if recipe.tags?.length}
			<ul class="tags">
				{#each recipe.tags as tag (tag)}<li>{tag}</li>{/each}
			</ul>
		{/if}
		{#if recipe.origin}<p class="origin">From {recipe.origin}</p>{/if}

		<div class="actions">
			<a class="cook" href={cookHref} data-sveltekit-keepfocus data-sveltekit-noscroll
				><Icon name="play" size={18} />Start cooking</a
			>
			<button
				type="button"
				aria-pressed={saved}
				disabled={!hydrated}
				onclick={() => favourites.toggle(card.id)}
			>
				<Icon name="heart" />{saved ? 'Favourited' : 'Favourite'}
			</button>
			<button type="button" disabled={!hydrated || !model.ready} onclick={onaddlist}>
				<Icon name="basket" />Add to shopping list
			</button>
			{#if onshare}
				<button type="button" disabled={!hydrated} onclick={onshare}>
					<Icon name="share" />Share
				</button>
			{/if}
			{#if onask}
				<button type="button" disabled={!hydrated} onclick={onask}>
					<Icon name="hat" />Ask the sous-chef
				</button>
			{/if}
			{#if edithref}
				<a class="edit" href={edithref}><Icon name="pencil" />Edit</a>
			{/if}
		</div>
	</div>
</header>

<style>
	header,
	.text {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}

	/* On a wide screen the photo sits beside the title and the buttons, not above them, so the
	   servings and the ingredients stay in the first screenful. */
	@media (min-width: 64rem) {
		header {
			grid-template-columns: minmax(0, 1fr) minmax(20rem, 28rem);
			align-items: start;
			gap: var(--space-6);
		}

		header > :global(.slot) {
			grid-column: 2;
			grid-row: 1;
		}
	}

	.titles {
		display: grid;
		gap: var(--space-2);
	}

	.local {
		color: var(--colour-muted);
		font-size: var(--text-l);
		font-style: italic;
	}

	.summary {
		max-inline-size: var(--measure);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-5);
	}

	dt {
		color: var(--colour-muted);
	}

	dd {
		font-size: var(--text-l);
	}

	.difficulty {
		text-transform: capitalize;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.tags li {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.origin {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	button,
	.cook,
	.edit {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		font-weight: 700;
		transition: background-color var(--duration-micro);
	}

	.edit {
		text-decoration: none;
	}

	.cook {
		border-color: var(--colour-primary);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		text-decoration: none;
	}

	button:hover:not(:disabled),
	.edit:hover {
		background: var(--colour-tint);
	}

	button[aria-pressed='true'] {
		border-color: var(--colour-accent);
		color: var(--colour-accent);
	}

	button[aria-pressed='true'] :global(svg) {
		fill: currentColor;
	}

	/* The fixed bar carries this link on a phone. */
	@media (max-width: 47.99rem) {
		.cook {
			display: none;
		}
	}

	@media print {
		.tags,
		.actions,
		.origin {
			display: none;
		}

		.meta {
			gap: var(--space-2) var(--space-4);
		}

		dd {
			font-size: var(--text-m);
		}
	}
</style>
