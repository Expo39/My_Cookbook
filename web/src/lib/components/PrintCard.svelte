<script lang="ts">
	import { qrPath } from '$lib/card/qr';
	import { splitAmount, type QrMatrix } from '$lib/card/layout';
	import { shortUrl } from '$lib/card/content';
	import { formatMinutes, servingsText } from '$lib/recipe/format';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import type { RecipeCard } from '$lib/types/recipe';

	let { card, model, qr }: { card: RecipeCard; model: RecipeModel; qr: QrMatrix | null } = $props();

	const recipe = $derived(model.data.recipe);
	const view = $derived(model.view);
</script>

<section class="index-card" aria-label="Index card">
	<header>
		<h2>{recipe.title}</h2>
		{#if recipe.titleLocal}<p class="local">{recipe.titleLocal}</p>{/if}
		<p class="meta">
			{#if card.times.total}<span class="num">{formatMinutes(card.times.total)}</span>{/if}
			<span class="num">{servingsText(view.servings, recipe.servingsNoun)}</span>
		</p>
	</header>

	<div class="ingredients">
		<h3 class="label">Ingredients</h3>
		{#each view.groups as group, g (g)}
			{#if group.name}<h4 class="label">{group.name}</h4>{/if}
			<ul>
				{#each group.items as item, i (i)}
					{@const line = splitAmount(item.text, item.amount?.text)}
					<li>
						{#if line.amount}<span class="num">{line.amount}</span>{/if}
						{line.rest}
					</li>
				{/each}
			</ul>
		{/each}
	</div>

	<div class="method">
		<h3 class="label">Method</h3>
		<ol>
			{#each view.steps as step, i (i)}
				<li>
					{#if step.heading}<strong>{step.heading}</strong>{/if}
					{step.text}
				</li>
			{/each}
		</ol>
	</div>

	<footer>
		{#if qr}
			<svg
				viewBox="-2 -2 {qr.size + 4} {qr.size + 4}"
				role="img"
				aria-label="QR code for this recipe"
			>
				<path d={qrPath(qr)} />
			</svg>
		{/if}
		<p>{shortUrl()}</p>
	</footer>
</section>

<style>
	.index-card {
		display: none;
	}

	@page card {
		size: A5 landscape;
		margin: 8mm;
	}

	@media print {
		.index-card {
			display: grid;
			grid-template-columns: 36% 1fr;
			grid-template-areas:
				'head head'
				'ingredients method'
				'foot foot';
			gap: var(--space-3) var(--space-5);
			page: card;
			font-size: 8.5pt;
			line-height: 1.35;
		}

		header {
			grid-area: head;
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: var(--space-1) var(--space-4);
			padding-block-end: var(--space-2);
			border-block-end: 1px solid var(--colour-line);
		}

		h2 {
			font-size: 16pt;
		}

		.local {
			color: var(--colour-muted);
		}

		.meta {
			display: flex;
			gap: var(--space-3);
			margin-inline-start: auto;
		}

		.ingredients {
			grid-area: ingredients;
		}

		.method {
			grid-area: method;
		}

		.label {
			margin-block: var(--space-2) var(--space-1);
			color: var(--colour-primary);
			font-family: var(--font-body);
			font-size: 7.5pt;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		ul {
			display: grid;
			gap: var(--space-1);
		}

		li {
			break-inside: avoid;
		}

		ol {
			display: grid;
			gap: var(--space-1);
			padding-inline-start: 1.25rem;
		}

		footer {
			grid-area: foot;
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: var(--space-3);
			color: var(--colour-muted);
			font-size: 7.5pt;
		}

		svg {
			inline-size: 18mm;
			block-size: 18mm;
			fill: var(--colour-ink);
			shape-rendering: crispEdges;
		}
	}
</style>
