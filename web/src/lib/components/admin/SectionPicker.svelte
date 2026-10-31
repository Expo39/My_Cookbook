<script lang="ts">
	import '$lib/styles/admin.css';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import Icon from '../Icon.svelte';
	import Field from './Field.svelte';
	import TextField from './TextField.svelte';

	/** `local` is a recipe kept on this device, whose new sections live only with it. */
	let { ed, local = false }: { ed: EditorState; local?: boolean } = $props();

	const id = fieldId('section');
	const NEW = '+new';

	/** A new section is made right where the choice is, without leaving the picker. */
	let making = $state(false);
	let title = $state('');
	let parent = $state('');
	let problem = $state('');

	const plain = (label: string) => label.replace(' (new)', '');

	function choose(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (value === NEW) {
			parent = ed.form.section;
			making = true;
		} else {
			ed.form.section = value;
			making = false;
		}
	}

	function add() {
		if (!ed.addSection(parent, title)) {
			problem = 'Give the new section a name.';
			return;
		}
		title = problem = '';
		making = false;
	}
</script>

<div class="picker">
	<Field
		{id}
		label="Section"
		hint={ed.editing
			? 'Choosing another section moves the recipe.'
			: 'Where the recipe goes, such as Desserts.'}
		error={ed.errorFor('section')}
	>
		<select
			{id}
			class="control"
			value={making ? NEW : ed.form.section}
			onchange={choose}
			aria-invalid={ed.errorFor('section') ? 'true' : undefined}
		>
			<option value="" disabled>Choose a section</option>
			{#each ed.sectionOptions as option (option.path)}
				<option value={option.path}>{' '.repeat(option.depth)}{option.label}</option>
			{/each}
			<option value={NEW}>+ New section...</option>
		</select>
	</Field>

	{#if making}
		<div class="new" role="group" aria-label="New section">
			<TextField
				id="new-section"
				label="Name of the new section"
				bind:value={title}
				error={problem}
			/>
			<Field id="new-section-parent" label="Put it">
				<select id="new-section-parent" class="control" bind:value={parent}>
					<option value="">On its own, with the main sections</option>
					{#each ed.sectionOptions as option (option.path)}
						<option value={option.path}>Inside {plain(option.label)}</option>
					{/each}
				</select>
			</Field>
			{#if local}
				<p class="help">
					It stays with your recipe on this device, and the recipe shows under "Your recipes" on the
					home page.
				</p>
			{/if}
			<div class="buttons">
				<button type="button" class="btn primary" onclick={add}>
					<Icon name="plus" size={18} />Add the section
				</button>
				<button type="button" class="btn" onclick={() => (making = false)}>Cancel</button>
			</div>
		</div>
	{/if}

	{#if ed.form.newSections.length}
		<ul class="created">
			{#each ed.form.newSections as added (added.path)}
				<li>
					<span>New: {added.title}</span>
					<button
						type="button"
						class="icon-btn"
						aria-label="Remove the new section {added.title}"
						onclick={() => ed.removeSection(added.path)}
					>
						<Icon name="x" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.picker {
		display: grid;
		gap: var(--space-3);
	}

	.new {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-inline-start: 3px solid var(--colour-primary);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.created {
		display: grid;
		gap: var(--space-1);
	}

	.created li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding-inline-start: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-bg);
	}
</style>
