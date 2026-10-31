<script lang="ts">
	import '$lib/styles/admin.css';
	import Field from './Field.svelte';

	let {
		id,
		label,
		value = $bindable(''),
		hint,
		info,
		error,
		optional = false,
		type = 'text',
		rows = 0,
		inputmode,
		maxlength,
		counter,
		readonly = false,
		numeric = false,
		autocomplete = 'off',
		list,
		onblur,
		oninput
	}: {
		id: string;
		label: string;
		value?: string;
		hint?: string;
		info?: string;
		error?: string;
		optional?: boolean;
		type?: 'text' | 'password' | 'url';
		rows?: number;
		inputmode?: 'numeric' | 'decimal' | 'text';
		maxlength?: number;
		counter?: number;
		readonly?: boolean;
		numeric?: boolean;
		autocomplete?: 'off' | 'on' | 'current-password' | 'new-password';
		list?: string;
		onblur?: (event: FocusEvent) => void;
		oninput?: () => void;
	} = $props();

	const describedby = $derived(
		[hint || counter ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
			undefined
	);
	const shown = $derived(
		counter ? `${hint ? `${hint} ` : ''}${[...value].length} of ${counter} characters` : hint
	);
</script>

<Field {id} {label} {optional} {info} hint={shown} {error}>
	{#if rows}
		<textarea
			{id}
			class="control"
			class:num={numeric}
			{rows}
			{readonly}
			{maxlength}
			bind:value
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedby}
			{onblur}
			{oninput}
		></textarea>
	{:else}
		<input
			{id}
			class="control"
			class:num={numeric}
			{type}
			{inputmode}
			{readonly}
			{maxlength}
			{autocomplete}
			{list}
			bind:value
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedby}
			{onblur}
			{oninput}
		/>
	{/if}
</Field>
