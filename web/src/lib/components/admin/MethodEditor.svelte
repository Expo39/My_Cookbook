<script lang="ts">
	import '$lib/styles/admin.css';
	import { tick } from 'svelte';
	import { fieldId, type EditorState } from '$lib/admin/editor-state.svelte';
	import { moveItem, removeItem } from '$lib/admin/lists';
	import { emptyStep } from '$lib/admin/recipe-form';
	import { insertAt } from '$lib/admin/tokens';
	import Icon from '../Icon.svelte';
	import FieldSet from './FieldSet.svelte';
	import InfoTip from '../InfoTip.svelte';
	import InsertMenu from './InsertMenu.svelte';
	import RowList from './RowList.svelte';
	import TextField from './TextField.svelte';

	let { ed }: { ed: EditorState } = $props();

	const HEADING_INFO =
		'For a method in stages, such as "Day 1: the night before" or "The sauce". It shows as a heading over this step and the ones after it.';

	/** Steps whose heading box is open; a step that already has a heading always shows it. */
	const headed = $state<Record<string, boolean>>({});

	/** Where the cursor was in each step's text when focus last left it. */
	const cursors: Record<string, { start: number; end: number }> = {};

	function remember(uid: string, event: Event) {
		const area = event.currentTarget as HTMLTextAreaElement;
		cursors[uid] = { start: area.selectionStart, end: area.selectionEnd };
	}

	async function insert(index: number, token: string) {
		const step = ed.form.steps[index];
		const at = cursors[step.uid] ?? { start: step.text.length, end: step.text.length };
		const result = insertAt(step.text, at.start, at.end, token);
		step.text = result.text;
		cursors[step.uid] = { start: result.caret, end: result.caret };
		await tick();
		const area = document.getElementById(fieldId(`steps[${index}].text`)) as HTMLTextAreaElement;
		area?.focus();
		area?.setSelectionRange(result.caret, result.caret);
	}
</script>

<FieldSet legend="Method">
	<p class="help">Write each step on its own, the way you would tell someone in the kitchen.</p>
	{#if ed.plainSteps}
		<p class="hint">
			<Icon name="timer" size={18} />Write normally: times and temperatures become tappable timers.
		</p>
	{/if}
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
				{#if step.heading || headed[step.uid]}
					<TextField
						id={fieldId(`steps[${i}].heading`)}
						label="Heading above this step"
						bind:value={step.heading}
						optional
						info={HEADING_INFO}
					/>
				{:else}
					<div class="row">
						<button type="button" class="more" onclick={() => (headed[step.uid] = true)}>
							<Icon name="plus" size={16} />Add a heading above this step
						</button>
						<InfoTip topic="a heading above a step" text={HEADING_INFO} />
					</div>
				{/if}
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
				{#if ed.steps[i]?.found.length}
					<ul class="found" aria-label="Found in step {i + 1}">
						{#each ed.steps[i].found as item, f (f)}
							<li>
								<Icon
									name={item.kind === 'timer' ? 'timer' : 'thermometer'}
									size={16}
								/>{item.label}
							</li>
						{/each}
					</ul>
				{/if}
				{#if !ed.plainSteps}<InsertMenu {ed} oninsert={(token) => insert(i, token)} />{/if}
				<div class="times">
					<TextField
						id={fieldId(`steps[${i}].time.active`)}
						label="Hands-on time"
						hint="In minutes."
						info="Time you are busy with this step: chopping, stirring, shaping. It adds up to the time shown on the recipe."
						bind:value={step.active}
						inputmode="numeric"
						numeric
						optional
						error={ed.errorFor(`steps[${i}].time.active`)}
						onblur={() => ed.touch(`steps[${i}].time.active`)}
					/>
					<TextField
						id={fieldId(`steps[${i}].time.passive`)}
						label="Waiting time"
						hint="In minutes."
						info="Time the food looks after itself, such as baking, rising or chilling, while you are free."
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

	.hint {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		color: var(--colour-ink);
	}

	.hint :global(svg) {
		flex: none;
		color: var(--colour-primary);
	}

	.found {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.found li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border-radius: 999px;
		background: var(--colour-tint);
		color: var(--colour-primary);
		font-family: var(--font-num);
		font-size: var(--text-s);
		font-variant-numeric: tabular-nums;
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

	.times {
		display: grid;
		gap: var(--space-3);
	}

	.add {
		justify-self: start;
	}

	@media (min-width: 40rem) {
		.times {
			grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		}
	}
</style>
