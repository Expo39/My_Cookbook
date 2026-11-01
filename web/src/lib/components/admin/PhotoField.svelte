<script lang="ts">
	import '$lib/styles/admin.css';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import { PHOTO_TYPES, PhotoError, preparePhoto } from '$lib/admin/photo';
	import { fallbackSrc, photoOf } from '$lib/photo';
	import Icon from '../Icon.svelte';
	import FieldSet from './FieldSet.svelte';
	import TextField from './TextField.svelte';

	let { ed }: { ed: EditorState } = $props();

	const fileId = 'photo-file';
	/** Below this width a photo looks soft on a large screen; it is still accepted. */
	const SHARP_WIDTH = 1200;
	let problem = $state('');
	let busy = $state(false);
	let over = $state(false);

	const card = $derived(ed.originalCard);
	const saved = $derived.by(() => {
		const photo = photoOf(card?.image);
		return photo && ed.form.imageSrc && card ? fallbackSrc(card.id, photo.widths, 480) : undefined;
	});
	const shown = $derived(ed.photo?.url ?? saved);
	const has = $derived(Boolean(ed.photo || ed.form.imageSrc));
	const soft = $derived(ed.photo && ed.photo.width < SHARP_WIDTH ? ed.photo.width : 0);
	const error = $derived(problem || ed.errorFor('image.src'));

	async function take(file: File | undefined) {
		if (!file) return;
		problem = '';
		busy = true;
		try {
			const prepared = await preparePhoto(file);
			if (ed.photo) URL.revokeObjectURL(ed.photo.url);
			ed.photo = {
				blob: prepared.blob,
				width: prepared.width,
				url: URL.createObjectURL(prepared.blob)
			};
		} catch (failure) {
			problem =
				failure instanceof PhotoError ? failure.message : 'The photo could not be prepared.';
		} finally {
			busy = false;
		}
	}

	function choose(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		void take(input.files?.[0]).then(() => (input.value = ''));
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		over = false;
		void take(event.dataTransfer?.files[0]);
	}

	function remove() {
		if (ed.photo) URL.revokeObjectURL(ed.photo.url);
		ed.photo = null;
		ed.form.imageSrc = '';
		ed.form.imageAlt = '';
	}
</script>

<FieldSet legend="Photo">
	<p class="help">Optional. It leads the recipe page and the card you share.</p>

	<input
		id={fileId}
		class="sr-only"
		type="file"
		accept={PHOTO_TYPES.join(',')}
		disabled={busy}
		aria-describedby="{fileId}-hint{error ? ` ${fileId}-error` : ''}"
		onchange={choose}
	/>

	<div
		class="stage"
		class:over
		class:filled={Boolean(shown)}
		aria-busy={busy}
		role="group"
		aria-label="Photo"
		ondragover={(event) => {
			event.preventDefault();
			over = true;
		}}
		ondragleave={() => (over = false)}
		ondrop={drop}
	>
		{#if shown}
			<img src={shown} alt={ed.form.imageAlt || 'The chosen photo'} />
			<div class="overlay">
				<label for={fileId} class="btn on-photo"><Icon name="upload" size={18} />Replace</label>
				<button type="button" class="btn on-photo" onclick={remove}>
					<Icon name="trash" size={18} />Remove
				</button>
			</div>
		{:else}
			<label for={fileId} class="zone">
				<span class="badge"><Icon name="image" size={28} /></span>
				<strong>{busy ? 'Preparing the photo...' : 'Choose a photo'}</strong>
				<span class="or">or drop one here</span>
			</label>
		{/if}
		{#if busy && shown}
			<p class="working" role="status"><span>Preparing the photo...</span></p>
		{/if}
	</div>

	<p class="hint" id="{fileId}-hint">
		<Icon name="lock" size={16} />
		<span
			>JPEG, PNG or WebP, ideally at least {SHARP_WIDTH} px wide. It is resized to 1600 px and stripped
			of location data before it is saved.</span
		>
	</p>
	{#if soft}
		<p class="soft" role="status">
			<Icon name="alert" size={16} />This photo is {soft} px wide, so it may look soft on a large screen.
		</p>
	{/if}
	{#if error}
		<p class="error" id="{fileId}-error" role="alert"><Icon name="alert" size={16} />{error}</p>
	{/if}

	{#if has}
		<TextField
			id={fieldId('image.alt')}
			label="Describe the photo"
			bind:value={ed.form.imageAlt}
			hint="Read aloud to people who cannot see it, so say what is in it, such as 'A golden pie cut open to show the layers'."
			error={ed.errorFor('image.alt')}
			onblur={() => ed.touch('image.alt')}
		/>
	{/if}
</FieldSet>

<style>
	.stage {
		position: relative;
		display: grid;
		inline-size: min(100%, 32rem);
		aspect-ratio: 3 / 2;
		border: 2px dashed var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-bg);
		overflow: hidden;
		transition:
			border-color var(--duration-micro),
			background-color var(--duration-micro);
	}

	.stage.filled {
		border-style: solid;
		border-width: 1px;
	}

	.stage.over,
	.stage:has(.zone:hover) {
		border-color: var(--colour-primary);
		background: var(--colour-tint);
	}

	input:focus-visible + .stage {
		outline: 2px solid var(--colour-primary);
		outline-offset: 2px;
	}

	.zone {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-4);
		color: var(--colour-ink);
		text-align: center;
		cursor: pointer;
	}

	.badge {
		display: grid;
		place-items: center;
		inline-size: 3.5rem;
		block-size: 3.5rem;
		border-radius: 999px;
		background: var(--colour-tint);
		color: var(--colour-primary);
	}

	.zone strong {
		color: var(--colour-primary);
		font-size: var(--text-l);
	}

	.or {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	img {
		grid-area: 1 / 1;
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}

	.overlay {
		grid-area: 1 / 1;
		display: flex;
		flex-wrap: wrap;
		align-self: end;
		gap: var(--space-2);
		padding: var(--space-3);
	}

	.on-photo {
		border-color: var(--colour-surface);
		background: var(--colour-surface);
		box-shadow: var(--shadow-float);
		cursor: pointer;
	}

	.on-photo:hover {
		background: var(--colour-tint);
	}

	.working {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: var(--colour-scrim);
	}

	.working span {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-ink);
		font-weight: 700;
	}

	.hint,
	.soft {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--text-s);
	}

	.hint {
		color: var(--colour-muted);
	}

	.soft {
		color: var(--colour-warning);
		font-weight: 700;
	}

	.hint :global(svg),
	.soft :global(svg) {
		flex: none;
		margin-block-start: 0.15em;
	}
</style>
