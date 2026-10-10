<script lang="ts">
	import '$lib/styles/admin.css';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { recipesLinkingTo } from '$lib/admin/removal';
	import { createSource } from '$lib/data';
	import { uncached } from '$lib/data/uncached';
	import { editHref, pageHref } from '$lib/links';
	import Icon from '../Icon.svelte';
	import Modal from './Modal.svelte';
	import TextField from './TextField.svelte';

	let { ed, ondelete }: { ed: EditorState; ondelete: () => Promise<void> } = $props();

	let modal: Modal;
	let phase = $state<'checking' | 'blocked' | 'confirm' | 'failed'>('checking');
	let linked = $state<{ id: string; title: string }[]>([]);
	let typed = $state('');
	let busy = $state(false);
	let problem = $state('');

	const title = $derived(ed.original?.title ?? '');
	const matches = $derived(typed.trim().toLowerCase() === title.toLowerCase());

	export async function show() {
		phase = 'checking';
		typed = problem = '';
		modal.show();
		try {
			linked = await recipesLinkingTo(ed.originalId ?? '', ed.index, createSource(uncached));
			phase = linked.length ? 'blocked' : 'confirm';
		} catch {
			phase = 'failed';
			problem = 'The other recipes could not be checked, so nothing has been deleted.';
		}
	}

	async function confirm(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		problem = '';
		try {
			await ondelete();
			modal.close();
		} catch (error) {
			problem = error instanceof Error ? error.message : 'The recipe could not be deleted.';
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:this={modal} title="Delete this recipe">
	{#if phase === 'checking'}
		<p role="status">Checking whether other recipes link to it…</p>
	{:else if phase === 'blocked'}
		<p>
			<strong>{title}</strong> cannot be deleted yet. {linked.length === 1
				? 'This recipe lists it'
				: 'These recipes list it'} as related:
		</p>
		<ul class="linked">
			{#each linked as recipe (recipe.id)}
				<li>
					<a href={pageHref(recipe.id)}>{recipe.title}</a>
					<a class="btn" href={editHref({ id: recipe.id })} data-sveltekit-reload
						>Edit it to remove the link</a
					>
				</li>
			{/each}
		</ul>
		<p class="help">Remove the link in each, save, then come back to delete this recipe.</p>
	{:else if phase === 'confirm'}
		<form onsubmit={confirm}>
			<p>
				This removes <strong>{title}</strong>{ed.original?.image ? ' and its photo' : ''} from the cookbook.
				Git keeps the history, so it can be brought back.
			</p>
			<TextField
				id="delete-confirm"
				label="Type the recipe's title to confirm"
				bind:value={typed}
				hint={title}
			/>
			<button class="btn danger" disabled={!matches || busy}>
				<Icon name="trash" size={18} />{busy ? 'Deleting…' : 'Delete the recipe'}
			</button>
		</form>
	{/if}
	{#if problem}
		<p class="error" role="alert"><Icon name="alert" size={16} />{problem}</p>
	{/if}
</Modal>

<style>
	form,
	.linked {
		display: grid;
		gap: var(--space-3);
	}

	.linked li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
</style>
