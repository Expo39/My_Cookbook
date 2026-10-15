<script lang="ts">
	import '$lib/styles/admin.css';
	import { onMount } from 'svelte';
	import { admin } from '$lib/admin/session.svelte';
	import { createWriter } from '$lib/data';
	import { parseExport, toExport } from '$lib/data/local-export';
	import { WriteError } from '$lib/data/writer';
	import { editHref, mineHref } from '$lib/links';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { personal } from '$lib/stores/personal.svelte';
	import Modal from './admin/Modal.svelte';
	import Icon from './Icon.svelte';

	let { onnavigate, onunlock }: { onnavigate?: () => void; onunlock?: () => void } = $props();

	const uid = $props.id();
	let clearDialog: Modal | undefined = $state();
	let picker: HTMLInputElement | undefined = $state();
	let asking = $state<string | null>(null);
	let sharing = $state<string | null>(null);
	let problem = $state('');
	let done = $state('');

	const own = $derived(personal.list.filter((entry) => !entry.shared));
	const handedOver = $derived(personal.list.filter((entry) => entry.shared));
	const count = (n: number) => `${n} ${n === 1 ? 'recipe' : 'recipes'}`;

	onMount(() => void personal.load());

	function download() {
		const blob = new Blob([toExport(personal.list)], { type: 'application/json' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `my-recipes-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(link.href), 1000);
	}

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		problem = done = '';
		try {
			const entries = parseExport(await file.text());
			for (const entry of entries) await personal.save(entry.id, entry.recipe);
			done = `${count(entries.length)} imported.`;
		} catch (error) {
			problem = error instanceof Error ? error.message : 'That file could not be read.';
		}
	}

	async function clearAll() {
		await personal.clear();
		clearDialog?.close();
		chrome.notify('Your recipes were cleared from this device');
	}

	function ask(id: string) {
		problem = done = '';
		if (!admin.unlocked) {
			problem = 'Sharing needs the GitHub token. Unlock it under "Sharing to GitHub" below first.';
			onunlock?.();
			return;
		}
		asking = id;
	}

	async function share(id: string) {
		const entry = personal.get(id);
		if (!entry) return;
		asking = null;
		sharing = id;
		problem = '';
		try {
			const result = await createWriter(admin.token).save(id, entry.recipe, { isNew: true });
			await personal.markShared(id, result.commit);
			done = `"${entry.recipe.title}" is now in the cookbook. It appears after the next deploy, in a minute or two.`;
		} catch (error) {
			problem =
				error instanceof WriteError || error instanceof Error
					? error.message
					: 'The recipe could not be shared. Nothing was changed.';
		} finally {
			sharing = null;
		}
	}
</script>

<section class="personal" aria-labelledby="{uid}-title">
	<h3 id="{uid}-title" class="label">Your recipes</h3>
	<p class="help">
		Recipes you add are stored only in this browser on this device. Nobody else can see them unless
		you share them to GitHub, which needs a GitHub token.
	</p>

	{#if personal.loaded}
		<p class="count">
			<Icon name="device" size={18} />{own.length
				? `${count(own.length)} on this device`
				: 'No recipes of your own yet'}
		</p>

		{#if own.length}
			<ul class="list">
				{#each own as entry (entry.id)}
					<li>
						<a href={mineHref(entry.id)} onclick={onnavigate}>{entry.recipe.title}</a>
						{#if asking === entry.id}
							<div class="confirm" role="group" aria-label="Share {entry.recipe.title}">
								<p>
									Everyone will see it, and it becomes part of the cookbook. From then on it can
									only be changed with the token.
								</p>
								<div class="buttons">
									<button type="button" class="btn primary" onclick={() => share(entry.id)}>
										Share it
									</button>
									<button type="button" class="btn" onclick={() => (asking = null)}>Cancel</button>
								</div>
							</div>
						{:else}
							<button
								type="button"
								class="share"
								disabled={sharing !== null}
								onclick={() => ask(entry.id)}
							>
								<Icon name="cloudUpload" size={16} />{sharing === entry.id
									? 'Sharing...'
									: 'Share with everyone'}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if handedOver.length}
			<p class="help">
				Shared and waiting for the next deploy:
				{handedOver.map((entry) => entry.recipe.title).join(', ')}.
			</p>
		{/if}

		<a class="btn primary" href={editHref()} onclick={onnavigate}>
			<Icon name="plus" size={18} />Add a recipe
		</a>
		<div class="files">
			{#if personal.list.length}
				<button type="button" class="btn" onclick={download}>
					<Icon name="download" size={18} />Export
				</button>
			{/if}
			<button type="button" class="btn" onclick={() => picker?.click()}>
				<Icon name="upload" size={18} />Import
			</button>
			<input
				bind:this={picker}
				type="file"
				accept="application/json,.json"
				hidden
				onchange={upload}
			/>
		</div>

		{#if own.length}
			<button type="button" class="btn danger" onclick={() => clearDialog?.show()}>
				<Icon name="trash" size={18} />Clear all personal recipes
			</button>
		{/if}
	{/if}

	{#if problem}
		<p class="error" role="alert"><Icon name="alert" size={16} />{problem}</p>
	{/if}
	{#if done}<p class="help" role="status">{done}</p>{/if}
</section>

<Modal bind:this={clearDialog} title="Clear all personal recipes?">
	<p>
		This deletes {count(own.length)} from this device for good. Export them first if you want to keep
		a copy.
	</p>
	<div class="buttons">
		<button type="button" class="btn danger" onclick={clearAll}>
			<Icon name="trash" size={18} />Delete {count(own.length)}
		</button>
		<button type="button" class="btn" onclick={() => clearDialog?.close()}>Keep them</button>
	</div>
</Modal>

<style>
	.personal {
		display: grid;
		gap: var(--space-3);
	}

	.personal .label {
		color: var(--colour-muted);
	}

	.help {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.count {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 700;
	}

	.list {
		display: grid;
		margin: 0;
		padding: 0;
		border-block-start: 1px solid var(--colour-line);
		list-style: none;
	}

	.list li {
		display: grid;
		padding-block: var(--space-2) 0;
		border-block-end: 1px solid var(--colour-line);
	}

	.list a {
		color: var(--colour-ink);
		font-weight: 700;
		text-decoration: none;
	}

	.list a:hover {
		color: var(--colour-primary);
		text-decoration: underline;
	}

	.share {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-1);
		min-block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-primary);
		font-size: var(--text-s);
		font-weight: 700;
		cursor: pointer;
	}

	.share:hover:not(:disabled) {
		text-decoration: underline;
	}

	.share:disabled {
		opacity: 0.55;
	}

	.confirm {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		font-size: var(--text-s);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.files {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: var(--space-2);
	}
</style>
