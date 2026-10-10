<script lang="ts">
	import '$lib/styles/admin.css';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { allRecipes } from '$lib/data/tree';
	import FieldSet from './FieldSet.svelte';
	import TextField from './TextField.svelte';

	let { ed }: { ed: EditorState } = $props();

	let query = $state('');

	const cards = $derived(allRecipes(ed.index).filter((card) => card.id !== ed.originalId));
	const shown = $derived(
		cards.filter((card) => card.title.toLowerCase().includes(query.trim().toLowerCase()))
	);
	/** Links to recipes that are no longer in the index still need a way to be removed. */
	const missing = $derived(ed.form.related.filter((id) => !cards.some((card) => card.id === id)));

	function toggle(id: string, on: boolean) {
		ed.form.related = on
			? [...ed.form.related, id]
			: ed.form.related.filter((related) => related !== id);
	}
</script>

<FieldSet legend="Related recipes" id="f-related">
	<p class="help">
		Shown at the foot of the recipe. Choose the ones that go well together, such as a main course
		and its side.
	</p>
	{#if cards.length > 8}
		<TextField id="related-filter" label="Find a recipe" bind:value={query} type="text" />
	{/if}
	<ul>
		{#each shown as card (card.id)}
			<li>
				<label>
					<input
						type="checkbox"
						checked={ed.form.related.includes(card.id)}
						onchange={(event) => toggle(card.id, event.currentTarget.checked)}
					/>
					<span>{card.title}</span>
				</label>
			</li>
		{:else}
			<li class="help">No recipe matches “{query}”.</li>
		{/each}
		{#each missing as id (id)}
			<li>
				<label>
					<input type="checkbox" checked onchange={() => toggle(id, false)} />
					<span>{id} <span class="help">(no longer in the cookbook)</span></span>
				</label>
			</li>
		{/each}
	</ul>
	<p class="help" role="status">
		{ed.form.related.length ? `${ed.form.related.length} chosen` : 'None chosen'}
	</p>
</FieldSet>

<style>
	ul {
		display: grid;
		max-block-size: 16rem;
		overflow-y: auto;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-bg);
	}

	label {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-block-size: var(--target);
		padding-inline: var(--space-3);
	}

	input {
		inline-size: 1.25rem;
		block-size: 1.25rem;
		accent-color: var(--colour-primary);
	}
</style>
