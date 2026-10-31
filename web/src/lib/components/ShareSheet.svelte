<script lang="ts">
	import { base } from '$app/paths';
	import { cardContent } from '$lib/card/content';
	import { loadPhoto, renderCard, toBlob } from '$lib/card/render';
	import { instagram } from '$lib/config';
	import { loadCore, qrMatrix } from '$lib/core';
	import { recipeText } from '$lib/kitchen/share-text';
	import { photoOf, widthUpTo } from '$lib/photo';
	import { servingsText } from '$lib/recipe/format';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { canonicalUrl } from '$lib/seo/site';
	import { download, shareFile, shareLink } from '$lib/share';
	import { chrome } from '$lib/stores/chrome.svelte';
	import type { RecipeCard } from '$lib/types/recipe';
	import Icon from './Icon.svelte';

	/**
	 * Opens on a preview of the recipe card, drawn for what the reader sees now: their servings,
	 * units and variants, with every ingredient and a code that opens the recipe. The card goes out
	 * with the recipe's link; a recipe kept on this device has no link, so that option is greyed out.
	 */
	let {
		card,
		model,
		local = false,
		onprint
	}: { card: RecipeCard; model: RecipeModel; local?: boolean; onprint: () => void } = $props();

	const FORMAT = 'portrait';

	let dialog: HTMLDialogElement;
	let made = $state<{ blob: Blob; url: string; name: string } | null>(null);
	let busy = $state(false);
	let status = $state('');
	let withText = $state(false);
	/** Phones hand the picture to other apps; most computers cannot, so there it is copied instead. */
	let canSend = $state(false);

	const title = $derived(model.data.recipe.title);
	const serves = $derived(servingsText(model.view.servings, model.data.recipe.servingsNoun));
	const link = () => `${location.origin}${location.pathname}${model.search('')}`;
	const asText = () => recipeText(title, serves, model.view, local ? undefined : link());

	export function show() {
		dialog.showModal();
		void make();
	}

	function reset() {
		if (made) URL.revokeObjectURL(made.url);
		made = null;
		status = '';
	}

	async function make() {
		busy = true;
		try {
			let qr = null;
			if (!local) {
				try {
					await loadCore();
					qr = qrMatrix(`${canonicalUrl(card.id)}${model.search('')}`) ?? null;
				} catch {
					/* the card is still useful without the code */
				}
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
			const blob = await toBlob(await renderCard({ format: FORMAT, content, photo }));
			reset();
			made = { blob, url: URL.createObjectURL(blob), name: `${card.id.split('/').at(-1)}.png` };
			const probe = new File([blob], made.name, { type: 'image/png' });
			canSend = typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
		} catch {
			status = 'The card could not be made. Close this and try again.';
		} finally {
			busy = false;
		}
	}

	async function sendCard() {
		if (!made) return;
		const text = withText ? asText() : local ? undefined : link();
		if (canSend) {
			const file = new File([made.blob], made.name, { type: 'image/png' });
			const outcome = await shareFile(file, title, text);
			if (outcome === 'shared') dialog.close();
			if (outcome === 'failed') status = 'The card could not be sent. Save it instead.';
			return;
		}
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': made.blob })]);
			if (text) status = 'Card copied. Paste it into a chat, then use Copy as text for the words.';
			else chrome.notify('Card copied. Paste it into any chat.');
		} catch {
			status = 'This browser cannot copy pictures. Save the image, then attach it.';
		}
	}

	async function sendLink() {
		const outcome = await shareLink(title, link());
		if (outcome === 'cancelled') return;
		dialog.close();
		if (outcome === 'copied') chrome.notify('Link copied');
		if (outcome === 'failed') chrome.notify('Could not share. Copy the address instead.', 5000);
	}

	async function copyText() {
		try {
			await navigator.clipboard.writeText(asText());
			chrome.notify('Recipe copied. Paste it anywhere.');
		} catch {
			status = 'The recipe could not be copied.';
		}
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
			<h2 id="share-title">Share</h2>
			<button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}>
				<Icon name="x" />
			</button>
		</div>

		<figure aria-busy={busy}>
			{#if made}
				<img src={made.url} alt="The recipe card for {title}" />
			{:else}
				<p class="making">{status || 'Making your card...'}</p>
			{/if}
		</figure>

		<label class="check">
			<input type="checkbox" bind:checked={withText} />
			<span>Send the whole recipe as text too</span>
		</label>

		<div class="actions">
			<button type="button" class="primary" disabled={!made} onclick={sendCard}>
				<Icon name={canSend ? 'send' : 'copy'} />{canSend ? 'Send the card' : 'Copy the card'}
			</button>
			<button type="button" disabled={!made} onclick={() => made && download(made.blob, made.name)}>
				<Icon name="download" />Save image
			</button>
			<button type="button" disabled={local} onclick={sendLink}>
				<Icon name="link" />Send the link
			</button>
			<button type="button" onclick={copyText}><Icon name="copy" />Copy as text</button>
			<button type="button" onclick={print}><Icon name="printer" />Print</button>
		</div>

		{#if local}
			<p class="note">
				This recipe is only on your device, so it has no link yet. The card and the text can be sent
				as they are.
			</p>
		{/if}
		{#if made && status}<p class="note" role="status">{status}</p>{/if}
	</div>
</dialog>

<style>
	dialog {
		inset: auto 0 0;
		inline-size: 100%;
		max-inline-size: none;
		max-block-size: 94dvh;
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
		padding: var(--space-4) var(--space-4) max(var(--space-4), env(safe-area-inset-bottom, 0px));
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	figure {
		display: grid;
		place-items: center;
		min-block-size: 12rem;
		margin: 0;
	}

	img {
		max-inline-size: 100%;
		max-block-size: 50dvh;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		box-shadow: var(--shadow-float);
		object-fit: contain;
	}

	.making {
		color: var(--colour-muted);
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
	}

	.check input {
		inline-size: 1.25rem;
		block-size: 1.25rem;
		accent-color: var(--colour-primary);
	}

	/* The main action takes a row of its own; the rest pair up, short enough for a phone. */
	.actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-2);
	}

	.primary {
		grid-column: 1 / -1;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		font-weight: 700;
		white-space: nowrap;
		transition: background-color var(--duration-micro);
	}

	button:hover:not(:disabled) {
		background: var(--colour-tint);
	}

	button:disabled {
		color: var(--colour-muted);
		opacity: 0.5;
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

	.note {
		color: var(--colour-muted);
		font-size: var(--text-s);
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
			inline-size: min(30rem, calc(100vw - 2 * var(--space-4)));
			block-size: fit-content;
			margin: auto;
			border: 1px solid var(--colour-line);
			border-radius: var(--radius-m);
		}

		.panel {
			padding: var(--space-5);
		}
	}
</style>
