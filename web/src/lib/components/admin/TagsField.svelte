<script lang="ts">
	import '$lib/styles/admin.css';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { allRecipes } from '$lib/data/tree';
	import Icon from '../Icon.svelte';
	import Field from './Field.svelte';

	let { ed }: { ed: EditorState } = $props();

	const id = 'f-tags';
	let text = $state('');

	const suggestions = $derived(
		[...new Set(allRecipes(ed.index).flatMap((card) => card.tags))]
			.filter((tag) => !ed.form.tags.includes(tag))
			.sort()
	);

	function add() {
		const tag = text.trim().replace(/,$/, '').trim();
		text = '';
		if (tag && !ed.form.tags.some((have) => have.toLowerCase() === tag.toLowerCase())) {
			ed.form.tags.push(tag);
		}
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			add();
		} else if (event.key === 'Backspace' && !text) {
			ed.form.tags.pop();
		}
	}
</script>

<Field
	{id}
	label="Tags"
	optional
	hint="Groupings such as “Italian Classics”. Press Enter or a comma after each one."
>
	{#if ed.form.tags.length}
		<ul class="chips">
			{#each ed.form.tags as tag, index (tag)}
				<li>
					{tag}
					<button
						type="button"
						aria-label="Remove the tag {tag}"
						onclick={() => ed.form.tags.splice(index, 1)}
					>
						<Icon name="x" size={16} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<input {id} class="control" bind:value={text} list="{id}-list" onkeydown={keydown} onblur={add} />
	<datalist id="{id}-list">
		{#each suggestions as tag (tag)}<option value={tag}></option>{/each}
	</datalist>
</Field>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chips li {
		display: flex;
		align-items: center;
		padding-inline-start: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-bg);
	}

	.chips button {
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-muted);
	}
</style>
