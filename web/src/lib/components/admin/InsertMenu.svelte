<script lang="ts">
	import '$lib/styles/admin.css';
	import { temperatureToken, timerToken } from '$lib/admin/tokens';
	import Icon from '../Icon.svelte';
	import InfoTip from '../InfoTip.svelte';

	/** Timers and temperatures only: an amount never goes in a step, so there is no ingredient here. */
	let { oninsert }: { oninsert: (token: string) => void } = $props();

	const id = $props.id();
	type Kind = 'temperature' | 'timer';

	let open = $state(false);
	let kind = $state<Kind>('timer');
	let degrees = $state('');
	let degreesTo = $state('');
	let fan = $state('');
	let internal = $state(false);
	let from = $state('');
	let to = $state('');
	let unit = $state<'sec' | 'min' | 'hr'>('min');
	let name = $state('');
	let problem = $state('');

	const positive = (text: string): number | undefined => {
		const value = Number(text);
		return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : undefined;
	};

	function insert() {
		problem = '';
		let token: string | undefined;
		if (kind === 'temperature') {
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
	<div class="opener">
		<button
			type="button"
			class="btn"
			aria-expanded={open}
			aria-controls="{id}-panel"
			onclick={() => (open = !open)}
		>
			<Icon name="plus" size={18} />Add to this step
		</button>
		<InfoTip
			topic="adding a timer or temperature"
			text="Puts it into the step where the cursor was: a timer the cook can tap, or a temperature that also shows in °F. Amounts are not added here: they stay in the ingredient list, where they change with the servings."
		/>
	</div>
	{#if !open}<p class="help">A timer or a temperature.</p>{/if}
	{#if open}
		<div class="panel" id="{id}-panel" role="group" aria-label="Insert into the step">
			<fieldset class="kinds">
				<legend class="sr-only">What to insert</legend>
				{#each [['timer', 'A timer'], ['temperature', 'A temperature']] as [value, label] (value)}
					<label>
						<input type="radio" name="{id}-kind" {value} bind:group={kind} />
						<span>{label}</span>
					</label>
				{/each}
			</fieldset>

			{#if kind === 'temperature'}
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

	/* As in the method's heading link: the "i" keeps a column of its own, so it never drops below
	   the button or runs past the card; a long label wraps inside the button. */
	.opener {
		display: grid;
		grid-template-columns: minmax(0, auto) auto 1fr;
		align-items: center;
		column-gap: var(--space-1);
		max-inline-size: 100%;
	}

	.opener > :global(p) {
		grid-column: 1 / -1;
	}

	/* A label short enough for the narrowest phone, so it never wraps beside the "i". */
	.opener > .btn {
		white-space: nowrap;
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
