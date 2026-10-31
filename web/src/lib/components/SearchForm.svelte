<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { SearchEngine, Suggestion } from '$lib/core';
	import { mineHref, pageHref, searchHref } from '$lib/links';
	import { searchEngine } from '$lib/search/engine';
	import { suggestLocal } from '$lib/search/local';
	import { personal } from '$lib/stores/personal.svelte';
	import Icon from './Icon.svelte';

	let { compact = false }: { compact?: boolean } = $props();

	const id = $props.id();
	const LIMIT = 6;

	let form: HTMLFormElement;
	let input: HTMLInputElement;
	let value = $state('');
	let engine = $state.raw<SearchEngine>();
	/** The core's suggestions, plus `mine` for a recipe added on this device. */
	type Option = Suggestion | { kind: 'mine'; id: string; title: string };
	let suggestions = $state<Option[]>([]);
	let open = $state(false);
	let active = $state(-1);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const optionId = (n: number) => `${id}-option-${n}`;

	/** The index loads on first focus, so pages that never search never pay for it. */
	function warm() {
		void personal.load();
		if (!engine)
			searchEngine().then(
				(loaded) => (engine = loaded),
				() => undefined
			);
	}

	function refresh() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const own = personal.list.filter((entry) => !entry.shared);
			const mine = suggestLocal(own, value, 2).map((hit) => ({ kind: 'mine' as const, ...hit }));
			const found = engine && value.trim() ? engine.suggest(value, LIMIT) : [];
			suggestions = [
				...mine,
				...found.filter((s) => !mine.some((m) => s.kind === 'recipe' && s.id === m.id))
			].slice(0, LIMIT);
			active = -1;
			open = suggestions.length > 0;
		}, 120);
	}

	function href(suggestion: Option): string {
		switch (suggestion.kind) {
			case 'mine':
				return mineHref(suggestion.id);
			case 'recipe':
				return pageHref(suggestion.id);
			case 'ingredient':
				return searchHref(suggestion.term);
			case 'correction':
				return searchHref(suggestion.query);
		}
	}

	function choose(suggestion: Option) {
		open = false;
		value = '';
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- href() builds on resolved links
		void goto(href(suggestion));
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (!suggestions.length) return;
			event.preventDefault();
			open = true;
			// -1 is the text box itself, between the last suggestion and the first.
			const last = suggestions.length - 1;
			if (event.key === 'ArrowDown') active = active >= last ? -1 : active + 1;
			else active = active <= -1 ? last : active - 1;
		} else if (event.key === 'Enter' && open && active >= 0) {
			event.preventDefault();
			choose(suggestions[active]);
		} else if (event.key === 'Escape' && open) {
			event.preventDefault();
			open = false;
			active = -1;
		}
	}

	/** "/" jumps to the header search from anywhere that is not already a text field. */
	function shortcut(event: KeyboardEvent) {
		if (!compact || event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target as HTMLElement;
		if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
		event.preventDefault();
		input.focus();
	}
</script>

<svelte:window onkeydown={shortcut} />

<form bind:this={form} class:compact action={resolve('/search')} method="get" role="search">
	<label for={id} class:sr-only={compact}>Search recipes</label>
	<div class="field">
		<Icon name="search" />
		<input
			bind:this={input}
			{id}
			type="search"
			name="q"
			role="combobox"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			aria-autocomplete="list"
			aria-expanded={open}
			aria-controls="{id}-list"
			aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
			placeholder={compact ? 'Search recipes' : 'Try brulee, lamb or tomato'}
			bind:value
			onfocus={warm}
			oninput={refresh}
			onkeydown={keydown}
			onblur={() => (open = false)}
		/>
		{#if !compact}
			<button type="submit">Search</button>
		{/if}
	</div>
	<ul id="{id}-list" role="listbox" aria-label="Suggestions" hidden={!open}>
		{#each suggestions as suggestion, n (n)}
			<!-- The keyboard drives these from the text box (aria-activedescendant); a click is for the pointer. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id={optionId(n)}
				role="option"
				aria-selected={n === active}
				onmousedown={(event) => event.preventDefault()}
				onclick={() => choose(suggestion)}
			>
				{#if suggestion.kind === 'recipe'}
					<Icon name="hat" size={18} /><span>{suggestion.title}</span>
				{:else if suggestion.kind === 'mine'}
					<Icon name="device" size={18} /><span>{suggestion.title} <em>Yours</em></span>
				{:else if suggestion.kind === 'ingredient'}
					<Icon name="basket" size={18} /><span
						>Recipes with <strong>{suggestion.term}</strong></span
					>
				{:else}
					<Icon name="search" size={18} /><span
						>Did you mean <strong>{suggestion.query}</strong>?</span
					>
				{/if}
			</li>
		{/each}
	</ul>
</form>

<style>
	/* The search box's natural width must not widen the page on a narrow phone. */
	form {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
	}

	label {
		font-weight: 700;
	}

	.field {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-inline-start: var(--space-3);
		border: 1px solid var(--colour-muted);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-muted);
		transition:
			border-color var(--duration-micro),
			background-color var(--duration-micro),
			inline-size var(--duration-panel) var(--ease-out);
	}

	.field:focus-within {
		border-color: var(--colour-primary);
		outline: 2px solid var(--colour-primary);
		outline-offset: 2px;
	}

	input {
		flex: 1;
		min-inline-size: 0;
		min-block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-ink);
		font-size: var(--text-l);
	}

	input:focus-visible {
		outline: none;
	}

	input::placeholder {
		color: var(--colour-muted);
	}

	input::-webkit-search-cancel-button {
		cursor: pointer;
	}

	button {
		display: grid;
		place-items: center;
		min-inline-size: var(--target);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 0;
		border-radius: 0 var(--radius-s) var(--radius-s) 0;
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-weight: 700;
	}

	/* The header box: a soft pill that widens while in use. */
	.compact .field {
		inline-size: 15rem;
		padding-inline: var(--space-3) var(--space-2);
		border-color: transparent;
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
	}

	.compact .field:hover {
		border-color: var(--colour-line);
	}

	.compact .field:focus-within {
		inline-size: 22rem;
		border-color: var(--colour-primary);
		background: var(--colour-surface);
		outline: none;
		box-shadow: 0 0 0 3px var(--colour-tint);
	}

	/* Slimmer than the bar it sits in, so the header keeps some air above and below it. */
	.compact input {
		min-block-size: 2.25rem;
		font-size: var(--text-s);
	}

	ul {
		position: absolute;
		inset-block-start: calc(100% + var(--space-2));
		inset-inline: 0;
		z-index: 30;
		display: grid;
		min-inline-size: 16rem;
		/* With the keyboard open the page is short; the list scrolls rather than running under it. */
		max-block-size: calc(100dvh - 10rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--space-1);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		box-shadow: var(--shadow-float);
	}

	ul[hidden] {
		display: none;
	}

	.compact ul {
		inset-inline: auto 0;
		inline-size: 22rem;
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border-radius: var(--radius-s);
		color: var(--colour-ink);
		cursor: pointer;
	}

	li em {
		margin-inline-start: var(--space-1);
		color: var(--colour-muted);
		font-size: var(--text-xs);
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	li :global(svg) {
		flex: none;
		color: var(--colour-muted);
	}

	li:hover,
	li[aria-selected='true'] {
		background: var(--colour-tint);
	}

	li[aria-selected='true'] :global(svg) {
		color: var(--colour-primary);
	}

	strong {
		color: var(--colour-primary);
	}

	@media (prefers-reduced-motion: reduce) {
		.field {
			transition: none;
		}
	}
</style>
