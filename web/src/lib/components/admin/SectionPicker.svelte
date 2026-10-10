<script lang="ts">
	import '$lib/styles/admin.css';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { fieldId } from '$lib/admin/editor-state.svelte';
	import Icon from '../Icon.svelte';
	import Field from './Field.svelte';
	import TextField from './TextField.svelte';

	let { ed }: { ed: EditorState } = $props();

	const id = fieldId('section');
	let title = $state('');
	let problem = $state('');

	const current = $derived(ed.sectionOptions.find((option) => option.path === ed.form.section));

	function add(parent: string) {
		if (ed.addSection(parent, title)) {
			title = '';
			problem = '';
		} else {
			problem = 'Give the section a name first.';
		}
	}
</script>

<div class="picker">
	<Field
		{id}
		label="Section"
		hint={ed.editing
			? 'Choosing another section moves the recipe.'
			: 'Where the recipe sits on the site.'}
		error={ed.errorFor('section')}
	>
		<select
			{id}
			class="control"
			bind:value={ed.form.section}
			aria-invalid={ed.errorFor('section') ? 'true' : undefined}
		>
			<option value="" disabled>Choose a section</option>
			{#each ed.sectionOptions as option (option.path)}
				<option value={option.path}>{' '.repeat(option.depth)}{option.label}</option>
			{/each}
		</select>
	</Field>

	<div class="add">
		<TextField
			id="new-section"
			label="New section"
			bind:value={title}
			optional
			hint="Creates a folder with its own page. Add it inside the chosen section, or at the top."
			error={problem}
		/>
		<div class="buttons">
			{#if current}
				<button type="button" class="btn" onclick={() => add(ed.form.section)}>
					<Icon name="plus" size={18} />Add inside {current.label.replace(' (new)', '')}
				</button>
			{/if}
			<button type="button" class="btn" onclick={() => add('')}>
				<Icon name="plus" size={18} />Add at the top level
			</button>
		</div>
	</div>

	{#if ed.form.newSections.length}
		<ul class="created">
			{#each ed.form.newSections as added (added.path)}
				<li>
					<span>{added.title} <code>{added.path}</code></span>
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
	.picker,
	.add {
		display: grid;
		gap: var(--space-3);
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

	code {
		color: var(--colour-muted);
		font-size: var(--text-xs);
	}
</style>
