<script lang="ts">
	import '$lib/styles/admin.css';
	import { formFromImport } from '$lib/admin/import';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { admin } from '$lib/admin/session.svelte';
	import { adminProof, type AiClient } from '$lib/ai';
	import Icon from '../Icon.svelte';
	import Modal from './Modal.svelte';

	let { ed, client, onimported }: { ed: EditorState; client: AiClient; onimported: () => void } =
		$props();

	const id = $props.id();
	let modal: Modal;
	let text = $state('');
	let busy = $state(false);
	let problem = $state('');

	const needsSecret = $derived(!admin.server && !admin.aiImportSecret);

	export function show() {
		problem = '';
		modal.show();
	}

	async function run(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		problem = '';
		try {
			const proof = admin.aiImportSecret ? await adminProof(admin.aiImportSecret) : undefined;
			const result = await client.importRecipe(text.trim(), proof);
			ed.restore(formFromImport(result.recipe, ed.form.section));
			text = '';
			modal.close();
			onimported();
		} catch (error) {
			problem = error instanceof Error ? error.message : 'The recipe could not be read.';
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:this={modal} title="Import from text">
	<form onsubmit={run}>
		<label for="{id}-text">Paste a recipe</label>
		<textarea id="{id}-text" class="control" rows="10" bind:value={text} disabled={busy}></textarea>
		<p class="help">
			The text is sent to the AI, which fills in the form. Nothing is saved: check every field
			first. It replaces what is in the form now.
		</p>
		{#if needsSecret}
			<p class="error" role="alert">
				<Icon name="alert" size={16} />The import secret is not set. Add it under Settings, Editing,
				Replace the token or AI secret.
			</p>
		{/if}
		{#if problem}
			<p class="error" role="alert"><Icon name="alert" size={16} />{problem}</p>
		{/if}
		<button class="btn primary" disabled={busy || !text.trim() || needsSecret}>
			{busy ? 'Reading the recipe...' : 'Fill in the form'}
		</button>
	</form>
</Modal>

<style>
	form {
		display: grid;
		gap: var(--space-3);
	}

	label {
		font-weight: 700;
	}
</style>
