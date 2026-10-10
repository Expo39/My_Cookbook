<script lang="ts">
	import { servingsText, unitLabel } from '$lib/recipe/format';
	import { haveChoices, sameKind } from '$lib/recipe/keys';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import type { PanShape, Unit, UnitSystem } from '$lib/types/recipe';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';
	import ServingsStepper from './ServingsStepper.svelte';

	let { model }: { model: RecipeModel } = $props();

	const id = $props.id();
	const recipe = $derived(model.data.recipe);
	const choices = $derived(haveChoices(model.keyed));
	const multipliers = [
		{ value: '0.5', label: '½×' },
		{ value: '1', label: '1×' },
		{ value: '2', label: '2×' },
		{ value: '3', label: '3×' }
	];

	const activeMultiplier = $derived(
		multipliers.find((m) => Math.abs(Number(m.value) - model.view.factor) < 1e-6)?.value ?? ''
	);
	const notes = $derived([
		...model.view.warnings.map((warning) => warning.message),
		...model.view.hints
	]);

	let haveKey = $state('');
	let haveQty = $state('');
	let haveUnit = $state('');
	let haveError = $state('');
	const haveUnits = $derived(sameKind(choices.find((c) => c.key === haveKey)?.unit));

	let panShape = $state<PanShape>('round');
	let panWidth = $state('');
	let panLength = $state('');
	let panDepth = $state('');
	let panError = $state('');

	const panDescription = $derived.by(() => {
		const pan = recipe.pan;
		if (!pan) return '';
		const sizes = pan.size.join(' × ');
		return `Written for a ${sizes} cm ${pan.shape === 'rect' ? 'rectangular' : pan.shape} tin${pan.depth ? `, ${pan.depth} cm deep` : ''}.`;
	});

	// Sensible starting points: the first ingredient, and a tin like the one the recipe was written for.
	$effect.pre(() => {
		const first = choices[0];
		haveKey = first?.key ?? '';
		haveUnit = first?.unit ?? '';
		const pan = recipe.pan;
		panShape = pan?.shape ?? 'round';
		panWidth = String(pan?.size[0] ?? '');
		panLength = String(pan?.size[1] ?? '');
		panDepth = String(pan?.depth ?? '');
	});

	function chooseIngredient(key: string) {
		haveKey = key;
		haveUnit = choices.find((c) => c.key === key)?.unit ?? '';
	}

	function applyHave(event: SubmitEvent) {
		event.preventDefault();
		const qty = Number(haveQty);
		if (!(qty > 0)) {
			haveError = 'Enter an amount above zero.';
			return;
		}
		haveError = '';
		model.scale = {
			kind: 'have',
			key: haveKey,
			qty,
			...(haveUnit ? { unit: haveUnit as Unit } : {})
		};
	}

	function applyPan(event: SubmitEvent) {
		event.preventDefault();
		const size = (panShape === 'rect' ? [panWidth, panLength] : [panWidth]).map(Number);
		if (!size.every((n) => n > 0)) {
			panError = 'Enter the size of your tin in centimetres.';
			return;
		}
		panError = '';
		const depth = Number(panDepth);
		model.scale = { kind: 'pan', pan: { shape: panShape, size, ...(depth > 0 ? { depth } : {}) } };
	}
</script>

<section aria-labelledby="{id}-title">
	<h2 id="{id}-title" class="sr-only">Adjust the recipe</h2>
	<fieldset class="controls" disabled={!model.ready}>
		<div class="row">
			<div class="field">
				<span class="label">Servings</span>
				<ServingsStepper
					label="Servings"
					value={servingsText(model.view.servings, recipe.servingsNoun)}
					canDecrease={model.view.servings > 1}
					onstep={(direction) => model.step(direction)}
				/>
			</div>
			<Segmented
				legend="Quick scale"
				name="{id}-multiplier"
				options={multipliers}
				value={activeMultiplier}
				onchange={(value) => model.setMultiplier(Number(value))}
			/>
			<Segmented
				legend="Units"
				name="{id}-units"
				options={[
					{ value: 'metric', label: 'Metric' },
					{ value: 'us', label: 'US' }
				]}
				value={model.effectiveSystem}
				onchange={(value) => model.setSystem(value as UnitSystem)}
			/>
		</div>

		{#each recipe.variants ?? [] as variant (variant.key)}
			<Segmented
				legend={variant.label}
				name="{id}-variant-{variant.key}"
				options={variant.options.map((option) => ({ value: option.key, label: option.label }))}
				value={model.chosenOption(variant.key)}
				onchange={(value) => model.setVariant(variant.key, value)}
			/>
		{/each}

		{#if choices.length || recipe.pan}
			<details>
				<summary><Icon name="chevronDown" size={18} />Scale another way</summary>
				<div class="more">
					{#if choices.length}
						<form onsubmit={applyHave} novalidate>
							<h3 class="label">I have…</h3>
							<div class="inputs">
								<label>
									<span>Ingredient</span>
									<select
										value={haveKey}
										onchange={(event) => chooseIngredient(event.currentTarget.value)}
									>
										{#each choices as choice (choice.key)}
											<option value={choice.key}>{choice.label}</option>
										{/each}
									</select>
								</label>
								<label>
									<span>Amount</span>
									<input
										class="num"
										type="text"
										inputmode="decimal"
										bind:value={haveQty}
										aria-invalid={haveError !== ''}
										aria-describedby={haveError ? `${id}-have-error` : undefined}
									/>
								</label>
								{#if haveUnits.length}
									<label>
										<span>Unit</span>
										<select bind:value={haveUnit}>
											{#each haveUnits as unit (unit)}
												<option value={unit}>{unitLabel(unit)}</option>
											{/each}
										</select>
									</label>
								{/if}
								<button type="submit">Scale to this</button>
							</div>
							{#if haveError}<p class="error" id="{id}-have-error">{haveError}</p>{/if}
						</form>
					{/if}

					{#if recipe.pan}
						<form onsubmit={applyPan} novalidate>
							<h3 class="label">My tin</h3>
							<p class="help">{panDescription}</p>
							<div class="inputs">
								<label>
									<span>Shape</span>
									<select bind:value={panShape}>
										<option value="round">Round</option>
										<option value="square">Square</option>
										<option value="rect">Rectangular</option>
									</select>
								</label>
								<label>
									<span
										>{panShape === 'round' ? 'Diameter' : panShape === 'square' ? 'Side' : 'Width'} (cm)</span
									>
									<input class="num" type="text" inputmode="decimal" bind:value={panWidth} />
								</label>
								{#if panShape === 'rect'}
									<label>
										<span>Length (cm)</span>
										<input class="num" type="text" inputmode="decimal" bind:value={panLength} />
									</label>
								{/if}
								<label>
									<span>Depth (cm, optional)</span>
									<input class="num" type="text" inputmode="decimal" bind:value={panDepth} />
								</label>
								<button type="submit">Scale to this tin</button>
							</div>
							{#if panError}<p class="error">{panError}</p>{/if}
						</form>
					{/if}
				</div>
			</details>
		{/if}
	</fieldset>

	{#if model.scaled}
		<p class="scaled">
			<span>Scaled <span class="num">×{Number(model.view.factor.toFixed(2))}</span></span>
			<button type="button" onclick={() => model.resetScale()}>
				<Icon name="reset" size={16} />Reset
			</button>
		</p>
	{/if}

	{#if notes.length}
		<ul class="notes">
			{#each notes as note (note)}
				<li><Icon name="alert" size={18} />{note}</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	section {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-tint);
	}

	.controls {
		display: grid;
		gap: var(--space-4);
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
		transition: opacity var(--duration-micro);
	}

	.controls:disabled {
		opacity: 0.6;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-4) var(--space-5);
	}

	.field {
		display: grid;
		gap: var(--space-1);
	}

	.label {
		color: var(--colour-muted);
	}

	summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		color: var(--colour-primary);
		font-weight: 700;
	}

	details[open] summary :global(svg) {
		transform: rotate(180deg);
	}

	.more {
		display: grid;
		gap: var(--space-5);
		padding-block: var(--space-2);
	}

	form {
		display: grid;
		gap: var(--space-2);
	}

	.inputs {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
	}

	label {
		display: grid;
		gap: var(--space-1);
		font-size: var(--text-s);
	}

	input,
	select {
		min-block-size: var(--target);
		min-inline-size: 7rem;
		padding-inline: var(--space-3);
		border: 1px solid var(--colour-muted);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
	}

	input {
		max-inline-size: 8rem;
	}

	input[aria-invalid='true'] {
		border-color: var(--colour-danger);
	}

	form button {
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 0;
		border-radius: var(--radius-s);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-weight: 700;
	}

	.help {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.error {
		color: var(--colour-danger);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.scaled {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		color: var(--colour-primary);
		font-weight: 700;
	}

	.scaled button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border: 0;
		background: transparent;
		color: var(--colour-primary);
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.notes {
		display: grid;
		gap: var(--space-2);
	}

	.notes li {
		display: flex;
		align-items: start;
		gap: var(--space-2);
		color: var(--colour-warning);
		font-size: var(--text-s);
	}

	.notes :global(svg) {
		flex: none;
		margin-block-start: 0.15rem;
	}

	@media print {
		section {
			display: none;
		}
	}
</style>
