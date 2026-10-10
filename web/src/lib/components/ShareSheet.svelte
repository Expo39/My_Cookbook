<script lang="ts">
	import { base } from '$app/paths';
	import { cardContent } from '$lib/card/content';
	import { SHARE_FORMATS, type FormatId } from '$lib/card/layout';
	import { loadPhoto, renderCard, toBlob } from '$lib/card/render';
	import { instagram } from '$lib/config';
	import { loadCore, qrMatrix } from '$lib/core';
	import { photoOf, widthUpTo } from '$lib/photo';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { canonicalUrl } from '$lib/seo/site';
	import { download, shareFile, shareLink } from '$lib/share';
	import { chrome } from '$lib/stores/chrome.svelte';
	import type { RecipeCard } from '$lib/types/recipe';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';

	let { card, model, onprint }: { card: RecipeCard; model: RecipeModel; onprint: () => void } =
		$props();

	interface Made {
		blob: Blob;
		url: string;
		name: string;
		format: FormatId;
		servings: number;
		units: string;
		variants: string;
	}

	let dialog: HTMLDialogElement;
	let format = $state<FormatId>('portrait');
	let made = $state<Made | null>(null);
	let busy = $state(false);
	let status = $state('');

	const title = $derived(model.data.recipe.title);
	const options = SHARE_FORMATS.map(({ id, label, ratio }) => ({
		value: id,
		label: `${label} ${ratio}`
	}));

	export function show() {
		dialog.showModal();
	}

	function reset() {
		if (made) URL.revokeObjectURL(made.url);
		made = null;
		status = '';
	}

	/** Draws the card for what the reader sees now: their servings, units and variants. */
	async function make(): Promise<Made | null> {
		busy = true;
		status = 'Making your card...';
		try {
			const search = model.search('');
			let qr = null;
			try {
				await loadCore();
				qr = qrMatrix(`${canonicalUrl(card.id)}${search}`) ?? null;
			} catch {
				/* the card is still useful without the code */
			}
			const info = photoOf(card.image);
			const photo = info
				? await loadPhoto(`${base}/img/${card.id}/${widthUpTo(info.widths, 1600)}.jpg`)
				: null;
			const content = cardContent({
				card,
				recipe: model.data.recipe,
				view: model.view,
				section: model.data.section,
				qr,
				hasPhoto: photo !== null,
				instagram: instagram?.handle
			});
			const blob = await toBlob(await renderCard({ format, content, photo }));
			reset();
			made = {
				blob,
				url: URL.createObjectURL(blob),
				name: `${card.id.split('/').at(-1)}-${format}.png`,
				format,
				servings: model.view.servings,
				units: model.effectiveSystem,
				variants: Object.entries(model.chosenVariants)
					.map(([key, option]) => `${key}:${option}`)
					.join(',')
			};
			status = '';
			return made;
		} catch {
			status = 'The card could not be made. Try again, or share the link instead.';
			return null;
		} finally {
			busy = false;
		}
	}

	async function copyOrShareLink() {
		const url = `${location.origin}${location.pathname}${model.search('')}`;
		const outcome = await shareLink(title, url);
		if (outcome === 'cancelled') return;
		dialog.close();
		if (outcome === 'copied') chrome.notify('Link copied');
		if (outcome === 'failed')
			chrome.notify('Could not share. Copy the address from the bar instead.', 5000);
	}

	async function shareCard() {
		const result = await make();
		if (!result) return;
		const file = new File([result.blob], result.name, { type: 'image/png' });
		const outcome = await shareFile(file, title);
		if (outcome === 'shared') dialog.close();
		if (outcome === 'unsupported') status = 'This browser cannot share the image. Save it instead.';
		if (outcome === 'failed') status = 'Sharing did not work. Save the image instead.';
	}

	function chooseFormat(value: string) {
		format = value as FormatId;
		if (made) void make();
	}

	function print() {
		dialog.close();
		onprint();
	}
</script>

<!-- Escape and the close button already work; a click on the backdrop is a convenience for the pointer. -->
<dialog
	bind:this={dialog}
	aria-labelledby="share-title"
	onclick={(event) => event.target === dialog && dialog.close()}
	onclose={reset}
>
	<div class="panel">
		<div class="head">
			<h2 id="share-title">Share this recipe</h2>
			<button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}>
				<Icon name="x" />
			</button>
		</div>

		<Segmented
			legend="Card format"
			name="card-format"
			{options}
			value={format}
			onchange={chooseFormat}
		/>

		<div class="actions">
			<button type="button" class="primary" disabled={busy} onclick={shareCard}>
				<Icon name="image" />Share recipe card
			</button>
			<button type="button" onclick={copyOrShareLink}><Icon name="link" />Share link</button>
			<button type="button" onclick={print}><Icon name="printer" />Print card</button>
		</div>

		<p class="status" role="status">{status}</p>

		{#if made}
			<figure>
				<img
					src={made.url}
					alt="Preview of the recipe card for {title}"
					data-format={made.format}
					data-servings={made.servings}
					data-units={made.units}
					data-variants={made.variants}
				/>
				<figcaption>
					<button type="button" onclick={() => made && download(made.blob, made.name)}>
						<Icon name="download" />Save image
					</button>
				</figcaption>
			</figure>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		inset: auto 0 0;
		inline-size: 100%;
		max-inline-size: none;
		max-block-size: 92dvh;
		margin: 0;
		padding: 0;
		border: 0;
		border-block-start: 1px solid var(--colour-line);
		border-radius: var(--radius-m) var(--radius-m) 0 0;
		background: var(--colour-surface);
		color: var(--colour-ink);
		box-shadow: var(--shadow-float);
		overflow-y: auto;
	}

	dialog[open] {
		animation: rise var(--duration-panel) var(--ease-out);
	}

	dialog::backdrop {
		background: var(--colour-scrim);
	}

	.panel {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5) var(--space-5) max(var(--space-5), env(safe-area-inset-bottom, 0px));
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--space-2);
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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

	button:hover:not(:disabled) {
		background: var(--colour-tint);
	}

	button:disabled {
		opacity: 0.6;
	}

	.primary {
		border-color: var(--colour-primary);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	.primary:hover:not(:disabled) {
		background: var(--colour-primary);
	}

	.close {
		inline-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
	}

	.status {
		min-block-size: 1.6em;
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	figure {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		margin: 0;
	}

	img {
		max-inline-size: 100%;
		max-block-size: 45dvh;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		object-fit: contain;
	}

	@keyframes rise {
		from {
			transform: translateY(2rem);
			opacity: 0;
		}
	}

	@media (min-width: 48rem) {
		dialog {
			inset: 0;
			inline-size: min(34rem, calc(100vw - 2 * var(--space-4)));
			block-size: fit-content;
			margin: auto;
			border: 1px solid var(--colour-line);
			border-radius: var(--radius-m);
		}
	}
</style>
