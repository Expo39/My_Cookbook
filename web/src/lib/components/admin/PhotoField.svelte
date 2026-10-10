<script lang="ts">
	import '$lib/styles/admin.css';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import { PHOTO_TYPES, PhotoError, preparePhoto } from '$lib/admin/photo';
	import { fallbackSrc, photoOf } from '$lib/photo';
	import Icon from '../Icon.svelte';
	import Field from './Field.svelte';
	import FieldSet from './FieldSet.svelte';
	import TextField from './TextField.svelte';

	let { ed }: { ed: EditorState } = $props();

	const fileId = 'photo-file';
	let problem = $state('');
	let busy = $state(false);

	const card = $derived(ed.originalCard);
	const saved = $derived.by(() => {
		const photo = photoOf(card?.image);
		return photo && ed.form.imageSrc && card ? fallbackSrc(card.id, photo.widths, 480) : undefined;
	});
	const shown = $derived(ed.photo?.url ?? saved);
	const has = $derived(Boolean(ed.photo || ed.form.imageSrc));

	async function choose(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
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
		} catch (error) {
			problem = error instanceof PhotoError ? error.message : 'The photo could not be prepared.';
		} finally {
			busy = false;
			input.value = '';
		}
	}

	function remove() {
		if (ed.photo) URL.revokeObjectURL(ed.photo.url);
		ed.photo = null;
		ed.form.imageSrc = '';
		ed.form.imageAlt = '';
	}
</script>

<FieldSet legend="Photo">
	{#if shown}
		<img class="thumb" src={shown} alt={ed.form.imageAlt || 'The chosen photo'} />
	{/if}
	<Field
		id={fileId}
		label={has ? 'Replace the photo' : 'Photo'}
		optional
		hint="A JPEG, PNG or WebP at least 1200 px wide. It is resized to 1600 px and stripped of location data before it is saved."
		error={problem || ed.errorFor('image.src')}
	>
		<input
			id={fileId}
			class="control"
			type="file"
			accept={PHOTO_TYPES.join(',')}
			disabled={busy}
			onchange={choose}
		/>
	</Field>
	{#if has}
		<TextField
			id={fieldId('image.alt')}
			label="Describe the photo"
			bind:value={ed.form.imageAlt}
			hint="For people who cannot see it, such as 'A golden pie cut open to show the layers'."
			error={ed.errorFor('image.alt')}
			onblur={() => ed.touch('image.alt')}
		/>
		<button type="button" class="btn danger remove" onclick={remove}>
			<Icon name="trash" size={18} />Remove the photo
		</button>
	{/if}
</FieldSet>

<style>
	.thumb {
		inline-size: min(100%, 24rem);
		aspect-ratio: 3 / 2;
		border-radius: var(--radius-m);
		object-fit: cover;
	}

	.remove {
		justify-self: start;
	}
</style>
