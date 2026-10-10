<script lang="ts">
	import '$lib/styles/admin.css';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { ingredientToken, temperatureToken, timerToken } from '$lib/admin/tokens';
	import Icon from '../Icon.svelte';

	let { ed, oninsert }: { ed: EditorState; oninsert: (token: string) => void } = $props();

	const id = $props.id();
	type Kind = 'ingredient' | 'temperature' | 'timer';

	let open = $state(false);
	let kind = $state<Kind>('ingredient');
	let ingredient = $state('');
	let amountOnly = $state(false);
	let degrees = $state('');
	let degreesTo = $state('');
	let fan = $state('');
	let internal = $state(false);
	let from = $state('');
	let to = $state('');
	let unit = $state<'sec' | 'min' | 'hr'>('min');
	let name = $state('');
	let problem = $state('');

	const rows = $derived(ed.ingredientRows);

	const positive = (text: string): number | undefined => {
		const value = Number(text);
		return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : undefined;
	};

	function insert() {
		problem = '';
		let token: string | undefined;
		if (kind === 'ingredient') {
			const row = rows.find((r) => r.uid === ingredient);
			if (!row) problem = 'Choose an ingredient.';
			else token = ingredientToken(ed.ensureKey(row), amountOnly);
		} else if (kind === 'temperature') {
			const celsius = positive(degrees);
			const max = positive(degreesTo);
			const fanDegrees = positive(fan);
			if (celsius === undefined) problem = 'Enter the temperature in °C.';
			else if (degreesTo && max === undefined) problem = 'Enter the upper temperature in °C.';
			else if (fan && fanDegrees === undefined) problem = 'Enter the fan temperature in °C.';
			else token = temperatureToken({ celsius, max, fan: fanDegrees, internal });
		} else {
			const min = positive(from);
			const max = positive(to);
			if (min === undefined) problem = 'Enter how long the timer runs.';
			else if (to && max === undefined) problem = 'Enter the longest time.';
			else token = timerToken({ min, max, unit, name });
		}
		if (!token) return;
		oninsert(token);
		open = false;
	}
</script>

<div class="insert">
	<button
		type="button"
		class="btn"
		aria-expanded={open}
		aria-controls="{id}-panel"
		onclick={() => (open = !open)}
	>
		<Icon name="plus" size={18} />Insert
	</button>
	{#if open}
		<div class="panel" id="{id}-panel" role="group" aria-label="Insert into the step">
			<fieldset class="kinds">
				<legend class="sr-only">What to insert</legend>
				{#each [['ingredient', 'An ingredient'], ['temperature', 'A temperature'], ['timer', 'A timer']] as [value, label] (value)}
					<label>
						<input type="radio" name="{id}-kind" {value} bind:group={kind} />
						<span>{label}</span>
					</label>
				{/each}
			</fieldset>

			{#if kind === 'ingredient'}
				{#if rows.length}
					<label for="{id}-ingredient">Ingredient</label>
					<select id="{id}-ingredient" class="control" bind:value={ingredient}>
						<option value="">Choose...</option>
						{#each rows as row (row.uid)}
							<option value={row.uid}>{row.item}</option>
						{/each}
					</select>
					<label class="check">
						<input type="checkbox" bind:checked={amountOnly} />
						<span>The amount only, without the name</span>
					</label>
					<p class="help">
						The page shows the amount for the number of servings being cooked, such as "600 g short
						pasta".
					</p>
				{:else}
					<p class="help">Add some ingredients first, then they can be mentioned here.</p>
				{/if}
			{:else if kind === 'temperature'}
				<div class="pair">
					<div>
						<label for="{id}-deg">Temperature (°C)</label>
						<input id="{id}-deg" class="control num" inputmode="decimal" bind:value={degrees} />
					</div>
					<div>
						<label for="{id}-deg-to">Up to (°C), optional</label>
						<input
							id="{id}-deg-to"
							class="control num"
							inputmode="decimal"
							bind:value={degreesTo}
						/>
					</div>
				</div>
				<label for="{id}-fan">Fan oven (°C), optional</label>
				<input id="{id}-fan" class="control num" inputmode="decimal" bind:value={fan} />
				<label class="check">
					<input type="checkbox" bind:checked={internal} />
					<span>Food temperature, such as the inside of a steak</span>
				</label>
				<p class="help">
					Shown in the unit each reader chooses. Oven temperatures are rounded to oven settings;
					food temperatures stay exact.
				</p>
			{:else}
				<div class="pair">
					<div>
						<label for="{id}-from">Time</label>
						<input id="{id}-from" class="control num" inputmode="decimal" bind:value={from} />
					</div>
					<div>
						<label for="{id}-to">Up to, optional</label>
						<input id="{id}-to" class="control num" inputmode="decimal" bind:value={to} />
					</div>
				</div>
				<label for="{id}-unit">Unit</label>
				<select id="{id}-unit" class="control" bind:value={unit}>
					<option value="sec">seconds</option>
					<option value="min">minutes</option>
					<option value="hr">hours</option>
				</select>
				<label for="{id}-name">Name, optional</label>
				<input id="{id}-name" class="control" bind:value={name} />
				<p class="help">
					Readers can tap the time to start a timer. A name such as "pasta" labels it.
				</p>
			{/if}

			{#if problem}
				<p class="problem" role="alert"><Icon name="alert" size={16} />{problem}</p>
			{/if}
			<div class="buttons">
				<button type="button" class="btn" onclick={() => (open = false)}>Cancel</button>
				<button type="button" class="btn primary" onclick={insert}>Insert into step</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.insert {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
	}

	.panel {
		display: grid;
		gap: var(--space-2);
		inline-size: 100%;
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.kinds label {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
	}

	.kinds label:has(:checked) {
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	.kinds label:has(:focus-visible) {
		outline: 2px solid var(--colour-primary);
		outline-offset: 2px;
	}

	.kinds input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	label:not(.check, .kinds label) {
		font-weight: 700;
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	.pair > div {
		display: grid;
		gap: var(--space-1);
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
	}

	.check input {
		inline-size: 1.25rem;
		block-size: 1.25rem;
		accent-color: var(--colour-primary);
	}

	.help {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.problem {
		display: flex;
		gap: var(--space-1);
		color: var(--colour-danger);
		font-weight: 700;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		justify-content: flex-end;
	}
</style>
