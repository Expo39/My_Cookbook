<script lang="ts">
	interface Option {
		value: string;
		label: string;
	}

	let {
		legend,
		name,
		options,
		value,
		onchange,
		hideLegend = false
	}: {
		legend: string;
		name: string;
		options: Option[];
		value: string;
		onchange: (value: string) => void;
		hideLegend?: boolean;
	} = $props();
</script>

<fieldset>
	<legend class="label" class:sr-only={hideLegend}>{legend}</legend>
	<div class="track">
		{#each options as option (option.value)}
			<label>
				<input
					type="radio"
					{name}
					value={option.value}
					checked={value === option.value}
					onchange={() => onchange(option.value)}
				/>
				<span>{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	fieldset {
		display: grid;
		gap: var(--space-1);
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		color: var(--colour-muted);
	}

	.track {
		display: flex;
		flex-wrap: wrap;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		overflow: hidden;
	}

	label {
		position: relative;
		flex: 1 1 auto;
	}

	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	span {
		display: grid;
		place-items: center;
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		color: var(--colour-primary);
		font-weight: 700;
		white-space: nowrap;
		transition:
			background-color var(--duration-micro),
			color var(--duration-micro);
	}

	label + label span {
		border-inline-start: 1px solid var(--colour-line);
	}

	input:checked + span {
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	input:focus-visible + span {
		outline: 2px solid var(--colour-primary);
		outline-offset: -4px;
	}

	input:checked:focus-visible + span {
		outline-color: var(--colour-on-primary);
	}
</style>
