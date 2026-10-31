<script lang="ts">
	import '$lib/styles/admin.css';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import Icon from '../Icon.svelte';
	import InfoTip from '../InfoTip.svelte';
	import Field from './Field.svelte';
	import TextField from './TextField.svelte';

	/**
	 * Two plain choices: the main section, then a subsection inside it if the cook wants one. A new
	 * section or subsection is added from the link under each, never from inside the dropdowns.
	 * `local` is a recipe kept on this device, whose new sections live only with it.
	 */
	let { ed, local = false }: { ed: EditorState; local?: boolean } = $props();

	const id = fieldId('section');
	const plain = (label: string) => label.replace(' (new)', '');

	const top = $derived(ed.form.section.split('/')[0]);
	const mains = $derived(ed.sectionOptions.filter((option) => !option.path.includes('/')));
	const subs = $derived(
		top ? ed.sectionOptions.filter((option) => option.path.startsWith(`${top}/`)) : []
	);
	const topLabel = $derived(plain(mains.find((option) => option.path === top)?.label ?? ''));

	/** Where a new section goes: '' for a main section, or the main section it sits inside. */
	let addingTo = $state<string | null>(null);
	let title = $state('');
	let problem = $state('');

	function add() {
		if (addingTo === null) return;
		if (!ed.addSection(addingTo, title)) {
			problem = 'Give it a name.';
			return;
		}
		title = problem = '';
		addingTo = null;
	}
</script>

{#snippet adder(parent: string, label: string, info: string)}
	{#if addingTo === parent}
		<div class="new" role="group" aria-label={label}>
			<TextField id="new-section" label="Name" bind:value={title} error={problem} />
			{#if local}
				<p class="help">
					It stays with your recipe on this device, and the recipe shows under "Your recipes" on the
					home page.
				</p>
			{/if}
			<div class="buttons">
				<button type="button" class="btn primary" onclick={add}>Add</button>
				<button type="button" class="btn" onclick={() => (addingTo = null)}>Cancel</button>
			</div>
		</div>
	{:else}
		<div class="row">
			<button type="button" class="more" onclick={() => ((addingTo = parent), (problem = ''))}>
				<Icon name="plus" size={16} />{label}
			</button>
			<InfoTip topic={label.toLowerCase()} text={info} />
		</div>
	{/if}
{/snippet}

<div class="picker">
	<div class="choice">
		<Field
			{id}
			label="Section"
			hint={ed.editing ? 'Choosing another section moves the recipe.' : undefined}
			error={ed.errorFor('section')}
		>
			<select
				{id}
				class="control"
				value={top}
				onchange={(event) => (ed.form.section = (event.currentTarget as HTMLSelectElement).value)}
				aria-invalid={ed.errorFor('section') ? 'true' : undefined}
			>
				<option value="" disabled>Choose one</option>
				{#each mains as option (option.path)}
					<option value={option.path}>{option.label}</option>
				{/each}
			</select>
		</Field>
		{@render adder(
			'',
			'New section',
			'A new main section, alongside First Courses or Desserts. Once it is added you can choose it, then add subsections inside it if you need them.'
		)}
	</div>

	{#if top}
		<div class="choice">
			<Field id="{id}-sub" label="Subsection" optional>
				<select
					id="{id}-sub"
					class="control"
					value={ed.form.section}
					onchange={(event) => (ed.form.section = (event.currentTarget as HTMLSelectElement).value)}
				>
					<option value={top}>None, straight in {topLabel}</option>
					{#each subs as option (option.path)}
						<option value={option.path}
							>{option.depth > 1 ? '— '.repeat(option.depth - 1) : ''}{option.label}</option
						>
					{/each}
				</select>
			</Field>
			{@render adder(
				top,
				`New subsection in ${topLabel}`,
				`A smaller group inside ${topLabel}, such as Cakes inside Desserts. The recipe goes into it.`
			)}
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
	.picker,
	.choice {
		display: grid;
		gap: var(--space-2);
	}

	.picker {
		gap: var(--space-4);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.more {
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
	}

	.more:hover {
		text-decoration: underline;
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

	@media (min-width: 40rem) {
		.picker:has(> .choice + .choice) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
		}

		.created {
			grid-column: 1 / -1;
		}
	}
</style>
