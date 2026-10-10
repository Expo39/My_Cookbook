<script lang="ts">
	import '$lib/styles/admin.css';
	import { tick } from 'svelte';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import { moveItem, removeItem } from '$lib/admin/lists';
	import { emptyStep } from '$lib/admin/recipe-form';
	import { insertAt } from '$lib/admin/tokens';
	import Icon from '../Icon.svelte';
	import FieldSet from './FieldSet.svelte';
	import InsertMenu from './InsertMenu.svelte';
	import RowList from './RowList.svelte';
	import TextField from './TextField.svelte';

	let { ed }: { ed: EditorState } = $props();

	/** Where the cursor was in each step's text when focus last left it. */
	const cursors = new Map<string, { start: number; end: number }>();

	function remember(uid: string, event: Event) {
		const area = event.currentTarget as HTMLTextAreaElement;
		cursors.set(uid, { start: area.selectionStart, end: area.selectionEnd });
	}

	async function insert(index: number, token: string) {
		const step = ed.form.steps[index];
		const at = cursors.get(step.uid) ?? { start: step.text.length, end: step.text.length };
		const result = insertAt(step.text, at.start, at.end, token);
		step.text = result.text;
		cursors.set(step.uid, { start: result.caret, end: result.caret });
		await tick();
		const area = document.getElementById(fieldId(`steps[${index}].text`)) as HTMLTextAreaElement;
		area?.focus();
		area?.setSelectionRange(result.caret, result.caret);
	}
</script>

<FieldSet legend="Method">
	<p class="help">
		Write each step on its own. A heading starts a titled stage, such as “Day 1: the night before”.
	</p>
	{#if ed.errorFor('steps')}
		<p class="error" role="alert" id="f-steps">
			<Icon name="alert" size={16} />{ed.errorFor('steps')}
		</p>
	{/if}
	<RowList
		items={ed.form.steps}
		noun="step"
		canRemove={ed.form.steps.length > 1}
		onmove={(from, to) => moveItem(ed.form.steps, from, to)}
		onremove={(index) => removeItem(ed.form.steps, index)}
	>
		{#snippet row(step, i)}
			<div class="step" id={fieldId(`steps[${i}]`)} tabindex="-1">
				<TextField
					id={fieldId(`steps[${i}].heading`)}
					label="Stage heading"
					bind:value={step.heading}
					optional
				/>
				<TextField
					id={fieldId(`steps[${i}].text`)}
					label="Step {i + 1}"
					bind:value={step.text}
					rows={4}
					error={ed.errorFor(`steps[${i}].text`)}
					onblur={(event) => {
						ed.touch(`steps[${i}].text`);
						remember(step.uid, event);
					}}
				/>
				<InsertMenu {ed} oninsert={(token) => insert(i, token)} />
				<div class="times">
					<TextField
						id={fieldId(`steps[${i}].time.active`)}
						label="Hands-on minutes"
						bind:value={step.active}
						inputmode="numeric"
						numeric
						optional
						error={ed.errorFor(`steps[${i}].time.active`)}
						onblur={() => ed.touch(`steps[${i}].time.active`)}
					/>
					<TextField
						id={fieldId(`steps[${i}].time.passive`)}
						label="Waiting minutes"
						bind:value={step.passive}
						inputmode="numeric"
						numeric
						optional
						error={ed.errorFor(`steps[${i}].time.passive`)}
						onblur={() => ed.touch(`steps[${i}].time.passive`)}
					/>
					{#if ed.form.variants.length || step.key}
						<TextField
							id={fieldId(`steps[${i}].key`)}
							label="Key"
							bind:value={step.key}
							optional
							hint="Lets a variant replace this step."
						/>
					{/if}
				</div>
			</div>
		{/snippet}
	</RowList>
	<button type="button" class="btn add" onclick={() => ed.form.steps.push(emptyStep())}>
		<Icon name="plus" size={18} />Add a step
	</button>
</FieldSet>

<style>
	.step {
		display: grid;
		gap: var(--space-3);
	}

	.step:focus {
		outline: none;
	}

	.times {
		display: grid;
		gap: var(--space-3);
	}

	.add {
		justify-self: start;
	}

	@media (min-width: 40rem) {
		.times {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
