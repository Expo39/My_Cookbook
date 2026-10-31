<script lang="ts">
	import '$lib/styles/admin.css';
	import { onDestroy, onMount } from 'svelte';
	import { PHOTO_TYPES, PhotoError, preparePhoto, type PreparedPhoto } from '$lib/admin/photo';
	import { savePhoto } from '$lib/admin/photo-save';
	import { admin } from '$lib/admin/session.svelte';
	import { createWriter } from '$lib/data';
	import { WriteError, type BuildStatus, type SaveResult } from '$lib/data/writer';
	import type { Photo } from '$lib/photo';
	import { devicePhotos, type ShownPhoto } from '$lib/stores/photos';
	import Modal from './admin/Modal.svelte';
	import Icon from './Icon.svelte';
	import RecipePhoto from './RecipePhoto.svelte';

	/**
	 * The recipe's photo, where the page shows it, and where a photo is added. Like a recipe, it is
	 * saved to GitHub when the owner has unlocked editing and the recipe is the cookbook's, and goes
	 * live with the next build; otherwise it is kept in this browser and shown only here.
	 */
	let {
		id,
		title,
		photo,
		toGitHub
	}: {
		id: string;
		title: string;
		/** The cookbook's published photo, when it has one. */
		photo: Photo | undefined;
		/** Editing is unlocked and the recipe is the cookbook's, so a photo is committed to GitHub. */
		toGitHub: boolean;
	} = $props();

	const POLL_MILLISECONDS = 5000;
	const POLL_LIMIT = 120;

	let input = $state<HTMLInputElement>();
	let modal = $state<ReturnType<typeof Modal>>();
	let chosen = $state<(PreparedPhoto & { url: string }) | null>(null);
	let alt = $state('');
	let busy = $state(false);
	let problem = $state('');
	/** The photo just committed, shown until the rebuilt page carries it. */
	let committed = $state<ShownPhoto | null>(null);
	/** The photo kept in this browser, read once the page has loaded. */
	let device = $state<ShownPhoto | null>(null);
	let loaded = $state(false);
	let status = $state<BuildStatus | null>(null);
	let stopped = false;

	/** A published photo is the cookbook's; without the token it can be looked at, not changed. */
	const canChange = $derived(toGitHub || !photo);
	const local = $derived(!committed && !photo && device);

	onMount(() => {
		void devicePhotos.load(id).then((found) => {
			device = found;
			loaded = true;
		});
	});

	onDestroy(() => {
		stopped = true;
		for (const url of [chosen?.url, committed?.url, device?.url]) if (url) URL.revokeObjectURL(url);
	});

	async function choose(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (input) input.value = '';
		if (!file) return;
		problem = '';
		busy = true;
		try {
			const prepared = await preparePhoto(file);
			chosen = { ...prepared, url: URL.createObjectURL(prepared.blob) };
			alt = committed?.alt ?? device?.alt ?? photo?.alt ?? '';
			modal?.show();
		} catch (error) {
			problem = error instanceof PhotoError ? error.message : 'That photo could not be prepared.';
		} finally {
			busy = false;
		}
	}

	function discard() {
		if (busy) return;
		if (chosen) URL.revokeObjectURL(chosen.url);
		chosen = null;
	}

	async function save() {
		if (!chosen) return;
		busy = true;
		problem = '';
		const shown = { url: chosen.url, alt: alt.trim() };
		try {
			if (toGitHub && admin.token) {
				const writer = createWriter(admin.token);
				const result = await savePhoto(writer, id, chosen.blob, alt);
				if (committed) URL.revokeObjectURL(committed.url);
				committed = shown;
				void follow(writer, result);
			} else {
				await devicePhotos.save(id, chosen.blob, alt);
				if (device) URL.revokeObjectURL(device.url);
				device = shown;
				status = null;
			}
			chosen = null;
			modal?.close();
		} catch (error) {
			problem =
				error instanceof WriteError || error instanceof Error
					? error.message
					: 'Something went wrong. Nothing was saved.';
		} finally {
			busy = false;
		}
	}

	async function removeLocal() {
		await devicePhotos.remove(id);
		if (device) URL.revokeObjectURL(device.url);
		device = null;
	}

	/** Follows the build that carries the photo, so the note can say when it is live. */
	async function follow(writer: ReturnType<typeof createWriter>, result: SaveResult) {
		status = { state: 'building' };
		for (let attempt = 0; attempt < POLL_LIMIT && !stopped; attempt++) {
			try {
				status = await writer.status(result);
			} catch {
				/* a missed check is tried again */
			}
			if (status?.state !== 'building') return;
			await new Promise((resolve) => setTimeout(resolve, POLL_MILLISECONDS));
		}
	}
</script>

{#if photo || canChange}
	<figure class="slot">
		{#if committed}
			<img class="fresh" src={committed.url} alt={committed.alt} />
		{:else if photo}
			<RecipePhoto {id} {photo} sizes="(min-width: 64rem) 28rem, 100vw" hero />
		{:else if device}
			<img class="fresh" src={device.url} alt={device.alt} />
		{:else}
			{#if !loaded}
				<!-- Holds a kept photo's place while it is read (the script in app.html knows of it). -->
				<div class="held" aria-hidden="true"></div>
			{/if}
			<button
				type="button"
				class="add"
				data-pending={loaded ? undefined : ''}
				disabled={busy}
				onclick={() => input?.click()}
			>
				<Icon name="image" size={28} />
				<span class="add-title">Add a photo</span>
				<span class="add-note">From your camera or your photos</span>
			</button>
		{/if}

		{#if canChange && (committed || photo || device)}
			<div class="tools">
				<button
					type="button"
					aria-label="Change photo"
					disabled={busy}
					onclick={() => input?.click()}
				>
					<Icon name="image" size={18} />Change
				</button>
				{#if local}
					<button type="button" aria-label="Remove photo" disabled={busy} onclick={removeLocal}>
						<Icon name="trash" size={18} />
					</button>
				{/if}
			</div>
		{/if}

		{#if canChange}
			<input
				bind:this={input}
				class="sr-only"
				type="file"
				accept={PHOTO_TYPES.join(',')}
				tabindex="-1"
				aria-label="Choose a photo for {title}"
				onchange={choose}
			/>
		{/if}

		{#if problem}
			<figcaption class="note error" role="alert">{problem}</figcaption>
		{:else if status}
			<figcaption class="note" role="status">
				{#if status.state === 'building'}
					Saved. It shows for everyone once the site rebuilds, in a few minutes.
				{:else if status.state === 'live'}
					The photo is live.
				{:else if status.state === 'superseded'}
					Saved. A later change is building and will carry the photo.
				{:else}
					Saved, but the build failed. <a href={status.url}>See what went wrong</a>.
				{/if}
			</figcaption>
		{:else if local}
			<figcaption class="note">
				<Icon name="device" size={16} />Only on this device
			</figcaption>
		{/if}
	</figure>
{/if}

{#if canChange}
	<Modal
		bind:this={modal}
		title={committed || photo || device ? 'Change the photo' : 'Add this photo'}
		onclose={discard}
	>
		{#if chosen}
			<div class="confirm">
				<img class="preview" src={chosen.url} alt="" />
				<label class="describe">
					<span>Describe the photo</span>
					<input class="control" type="text" bind:value={alt} maxlength="160" required />
					<span class="help">
						For people who cannot see it, such as "A golden pie cut open to show the layers".
					</span>
				</label>
				<p class="help">
					{#if toGitHub}
						It is saved to the cookbook on GitHub with the recipe, and shows for everyone once the
						site rebuilds.
					{:else}
						It is kept in this browser, so only you see it here. Unlock editing in Settings to save
						photos to the cookbook for everyone.
					{/if}
				</p>
				<div class="actions">
					<button type="button" class="btn primary" disabled={busy || !alt.trim()} onclick={save}>
						{busy ? 'Saving...' : 'Save photo'}
					</button>
					<button type="button" class="btn" disabled={busy} onclick={() => modal?.close()}>
						Cancel
					</button>
				</div>
				{#if problem}<p class="error" role="alert">{problem}</p>{/if}
			</div>
		{/if}
	</Modal>
{/if}

<style>
	.slot {
		position: relative;
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	/* On a phone an empty photo is a compact strip above the title, not a big empty frame. */
	.add {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		column-gap: var(--space-3);
		min-block-size: 4.5rem;
		padding: var(--space-3) var(--space-4);
		text-align: start;
		border: 2px dashed var(--colour-primary);
		border-radius: var(--radius-m);
		background: var(--colour-tint);
		color: var(--colour-primary);
	}

	.add:hover:not(:disabled) {
		background: var(--colour-surface);
	}

	.add :global(svg) {
		grid-row: span 2;
	}

	.add-title {
		font-weight: 700;
		font-size: var(--text-l);
	}

	.add-note {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.fresh {
		inline-size: 100%;
		aspect-ratio: 3 / 2;
		border-radius: var(--radius-m);
		object-fit: cover;
	}

	.tools {
		position: absolute;
		inset: var(--space-2) var(--space-2) auto auto;
		display: flex;
		gap: var(--space-2);
	}

	.tools button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		min-block-size: var(--target);
		min-inline-size: var(--target);
		padding-inline: var(--space-2);
		font-size: var(--text-s);
		border: 0;
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		font-weight: 700;
		box-shadow: var(--shadow-float);
	}

	.held {
		display: none;
		aspect-ratio: 3 / 2;
		border-radius: var(--radius-m);
		background: var(--colour-tint);
	}

	:global(html[data-local-photo]) .held {
		display: block;
	}

	:global(html[data-local-photo]) .add[data-pending] {
		display: none;
	}

	.note {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.note.error {
		color: var(--colour-danger);
	}

	.confirm {
		display: grid;
		gap: var(--space-4);
	}

	.preview {
		inline-size: 100%;
		max-block-size: 40dvh;
		border-radius: var(--radius-s);
		object-fit: contain;
		background: var(--colour-tint);
	}

	.describe {
		display: grid;
		gap: var(--space-1);
		font-weight: 700;
	}

	.describe .help {
		color: var(--colour-muted);
		font-weight: 400;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	@media (min-width: 48rem) {
		.fresh,
		.held,
		.slot :global(picture) {
			aspect-ratio: 4 / 3;
		}
	}

	@media print {
		.add,
		.tools,
		.note {
			display: none;
		}
	}
</style>
