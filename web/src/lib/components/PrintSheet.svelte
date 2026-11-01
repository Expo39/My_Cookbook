<script lang="ts">
	import { qrPath } from '$lib/card/qr';
	import { splitAmount, type QrMatrix } from '$lib/card/layout';
	import { shortUrl } from '$lib/card/content';
	import { fallbackSrc, srcset, type Photo } from '$lib/photo';
	import { servingsText, timeLabels } from '$lib/recipe/format';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { siteTitle } from '$lib/title';
	import type { RecipeCard } from '$lib/types/recipe';

	/**
	 * The whole recipe set on A4, for the print dialog however it is opened. It is hidden on screen,
	 * and shows exactly what the reader has on the page: their servings, units and variants.
	 */
	let {
		card,
		model,
		qr,
		photo,
		trail,
		notes
	}: {
		card: RecipeCard;
		model: RecipeModel;
		qr: QrMatrix | null;
		photo?: Photo;
		/** The sections above the recipe, outermost first. */
		trail: string[];
		/** The reader's own notes on this recipe, kept in the browser. */
		notes: string;
	} = $props();

	const recipe = $derived(model.data.recipe);
	const view = $derived(model.view);
	const facts = $derived([
		['Serves', servingsText(view.servings, recipe.servingsNoun)],
		...timeLabels(card.times),
		...(recipe.difficulty ? [['Difficulty', recipe.difficulty]] : [])
	]);
</script>

<article class="sheet" aria-label="Printed recipe">
	<header class="mast">
		<p>{trail.join(' / ')}</p>
		<p class="brand">{siteTitle}</p>
	</header>

	<div class="hero" class:pictured={Boolean(photo)}>
		<div class="titles">
			<h2>{recipe.title}</h2>
			{#if recipe.titleLocal}<p class="local">{recipe.titleLocal}</p>{/if}
			{#if recipe.summary}<p class="summary">{recipe.summary}</p>{/if}
			{#if recipe.origin}<p class="origin">From {recipe.origin}</p>{/if}
		</div>
		{#if photo}
			<!-- The same files and sizes as the photo on the page, so the browser reuses the one it has. -->
			<picture>
				<source
					type="image/webp"
					srcset={srcset(card.id, photo.widths, 'webp')}
					sizes="(min-width: 64rem) 28rem, 100vw"
				/>
				<img
					src={fallbackSrc(card.id, photo.widths)}
					srcset={srcset(card.id, photo.widths, 'jpg')}
					sizes="(min-width: 64rem) 28rem, 100vw"
					width={photo.width}
					height={photo.height}
					alt={photo.alt}
				/>
			</picture>
		{/if}
	</div>

	<dl class="facts">
		{#each facts as [label, value] (label)}
			<div>
				<dt>{label}</dt>
				<dd class={label === 'Difficulty' ? 'word' : 'num'}>{value}</dd>
			</div>
		{/each}
	</dl>

	<div class="body">
		<section class="ingredients" aria-label="Ingredients">
			<h3>Ingredients</h3>
			{#each view.groups as group, g (g)}
				{#if group.name}<h4>{group.name}</h4>{/if}
				<ul>
					{#each group.items as item, i (i)}
						{@const line = splitAmount(item.text, item.amount?.text)}
						<li>
							<span class="amount num">{line.amount}</span>
							<span>{line.rest}</span>
						</li>
					{/each}
				</ul>
			{/each}

			<!-- The column under the ingredients is usually empty, so the code sits there, not on a page of its own. -->
			<figure class="scan">
				{#if qr}
					<svg
						viewBox="-2 -2 {qr.size + 4} {qr.size + 4}"
						role="img"
						aria-label="QR code for this recipe"
					>
						<path d={qrPath(qr)} />
					</svg>
				{/if}
				<figcaption>
					{#if qr}<strong>Cook it from your phone.</strong> Scan for this recipe as printed, with its
						timers and shopping list.{/if}
					<span class="site">{shortUrl()}</span>
				</figcaption>
			</figure>
		</section>

		<section class="method" aria-label="Method">
			<h3>Method</h3>
			<ol>
				{#each view.steps as step, i (i)}
					<li>
						{#if step.heading}<h4>{step.heading}</h4>{/if}
						<div class="step">
							<span class="n num" aria-hidden="true">{i + 1}</span>
							<p>
								{#each step.segments as segment, s (s)}{#if segment.type === 'text'}{segment.text}{:else}<strong
											>{segment.text}</strong
										>{/if}{/each}
							</p>
						</div>
					</li>
				{/each}
			</ol>

			{#if view.tips.length}
				<aside class="note">
					<h3>{view.tips.length > 1 ? "Chef's tips" : "Chef's tip"}</h3>
					{#each view.tips as tip (tip)}<p>{tip}</p>{/each}
				</aside>
			{/if}
			{#if notes.trim()}
				<aside class="note own">
					<h3>Your notes</h3>
					<p>{notes.trim()}</p>
				</aside>
			{/if}
		</section>
	</div>
</article>

<style>
	.sheet {
		display: none;
	}

	@page {
		size: A4;
		margin: 14mm 15mm 16mm;

		@bottom-right {
			content: counter(page) ' / ' counter(pages);
			color: var(--colour-muted);
			font-family: var(--font-num);
			font-size: 8pt;
		}
	}

	@media print {
		.sheet {
			display: grid;
			gap: 6mm;
			color: var(--colour-ink);
			font-size: 10pt;
			line-height: 1.45;
		}

		.num {
			font-family: var(--font-num);
			font-variant-numeric: tabular-nums;
		}

		.mast {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 6mm;
			padding-block-end: 2mm;
			border-block-end: 0.75pt solid var(--colour-ink);
			color: var(--colour-muted);
			font-size: 7.5pt;
			letter-spacing: 0.12em;
			text-transform: uppercase;
		}

		.brand {
			color: var(--colour-primary);
			font-family: var(--font-display);
			font-weight: 800;
			letter-spacing: 0.04em;
		}

		.hero {
			display: grid;
			gap: 7mm;
			align-items: center;
		}

		.hero.pictured {
			grid-template-columns: 1fr 74mm;
		}

		.titles {
			display: grid;
			gap: 2.5mm;
			align-content: center;
		}

		h2 {
			color: var(--colour-primary);
			font-family: var(--font-display);
			font-size: 30pt;
			font-weight: 800;
			letter-spacing: -0.02em;
			line-height: 1.05;
			text-wrap: balance;
		}

		.local {
			color: var(--colour-accent);
			font-size: 12pt;
			font-style: italic;
		}

		.summary {
			max-inline-size: 60ch;
			font-size: 11pt;
			line-height: 1.5;
		}

		.origin {
			color: var(--colour-muted);
			font-size: 8.5pt;
		}

		picture {
			display: block;
			aspect-ratio: 4 / 3;
			border-radius: var(--radius-m);
			overflow: hidden;
		}

		img {
			display: block;
			inline-size: 100%;
			block-size: 100%;
			object-fit: cover;
		}

		.facts {
			display: flex;
			flex-wrap: wrap;
			border-block: 0.75pt solid var(--colour-line);
		}

		.facts div {
			display: grid;
			gap: 0.5mm;
			flex: 1 1 0;
			padding: 2.5mm 4mm;
		}

		.facts div + div {
			border-inline-start: 0.75pt solid var(--colour-line);
		}

		dt,
		h3 {
			color: var(--colour-accent);
			font-family: var(--font-body);
			font-size: 7pt;
			font-weight: 700;
			letter-spacing: 0.14em;
			text-transform: uppercase;
		}

		dd {
			font-size: 12pt;
			font-weight: 600;
		}

		.word {
			text-transform: capitalize;
		}

		.body {
			display: grid;
			grid-template-columns: 60mm 1fr;
			gap: 8mm;
			align-items: start;
		}

		.ingredients {
			display: grid;
			gap: 2mm;
			padding-inline-end: 6mm;
			border-inline-end: 0.75pt solid var(--colour-line);
		}

		h3 {
			padding-block-end: 1.5mm;
			border-block-end: 1.5pt solid var(--colour-accent);
			break-after: avoid;
		}

		h4 {
			margin-block-start: 2mm;
			color: var(--colour-primary);
			font-family: var(--font-display);
			font-size: 10.5pt;
			font-weight: 800;
			break-after: avoid;
		}

		ul {
			display: grid;
			padding: 0;
			list-style: none;
		}

		/* A box to tick in pencil, then the amount in its own column and the ingredient. */
		.ingredients li {
			display: grid;
			grid-template-columns: 2.6mm minmax(12mm, auto) 1fr;
			gap: 2mm;
			align-items: baseline;
			padding-block: 1.1mm;
			border-block-end: 0.5pt dashed var(--colour-line);
			font-size: 9.5pt;
			line-height: 1.35;
			break-inside: avoid;
		}

		.ingredients li::before {
			content: '';
			inline-size: 2.6mm;
			block-size: 2.6mm;
			border: 0.75pt solid var(--colour-muted);
			border-radius: 0.6mm;
			transform: translateY(0.3mm);
		}

		.amount {
			color: var(--colour-primary);
			font-weight: 600;
			white-space: nowrap;
		}

		.method {
			display: grid;
			gap: 3mm;
		}

		ol {
			display: grid;
			gap: 3.5mm;
			padding: 0;
			list-style: none;
		}

		ol h4 {
			margin-block: 1mm 1.5mm;
			padding-block-end: 1mm;
			border-block-end: 0.5pt solid var(--colour-line);
		}

		.step {
			display: grid;
			grid-template-columns: 8mm 1fr;
			gap: 2mm;
			break-inside: avoid;
		}

		.n {
			color: var(--colour-accent);
			font-size: 16pt;
			font-weight: 600;
			line-height: 1;
		}

		.step p {
			line-height: 1.5;
		}

		.step strong {
			color: var(--colour-primary);
		}

		.note {
			display: grid;
			gap: 1.5mm;
			margin-block-start: 2mm;
			padding: 3mm 4mm;
			border: 0.75pt solid var(--colour-line);
			border-inline-start: 2.5pt solid var(--colour-accent);
			border-radius: var(--radius-s);
			break-inside: avoid;
		}

		.note h3 {
			padding: 0;
			border: 0;
		}

		.own {
			border-inline-start-color: var(--colour-primary);
		}

		.own p {
			white-space: pre-line;
		}

		.scan {
			display: grid;
			gap: 2mm;
			justify-items: start;
			margin: 4mm 0 0;
			padding-block-start: 4mm;
			border-block-start: 0.75pt solid var(--colour-ink);
			color: var(--colour-muted);
			font-size: 7.5pt;
			line-height: 1.4;
			break-inside: avoid;
		}

		.scan svg {
			inline-size: 22mm;
			block-size: 22mm;
			fill: var(--colour-ink);
			shape-rendering: crispEdges;
		}

		.scan strong {
			color: var(--colour-ink);
		}

		.site {
			display: block;
			margin-block-start: 1mm;
			color: var(--colour-primary);
			font-weight: 700;
		}
	}
</style>
