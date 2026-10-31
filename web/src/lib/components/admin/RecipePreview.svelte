<script lang="ts">
	import '$lib/styles/admin.css';
	import { untrack } from 'svelte';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import { scaleRecipe } from '$lib/core';
	import { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import { Ticks } from '$lib/stores/ticks.svelte';
	import type { Recipe, RecipeCard, RecipeData } from '$lib/types/recipe';
	import IngredientsPanel from '../IngredientsPanel.svelte';
	import MethodPanel from '../MethodPanel.svelte';
	import RecipeHeader from '../RecipeHeader.svelte';

	let { ed }: { ed: EditorState } = $props();

	const ticks = new Ticks('preview');
	let recipe = $state.raw<Recipe>(untrack(() => ed.built.recipe));
	let model = $state.raw<RecipeModel | null>(null);

	// Rebuilt a moment after the last keystroke, since scaling runs in WASM.
	$effect(() => {
		const next = ed.built.recipe;
		const timer = setTimeout(() => (recipe = next), 250);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const current = recipe;
		const ready = ed.coreReady;
		untrack(() => {
			model = null;
			if (!ready) return;
			try {
				const data: RecipeData = {
					recipe: current,
					related: [],
					section: [],
					view: scaleRecipe(current)
				};
				model = new RecipeModel(data, () => 'metric');
			} catch {
				model = null;
			}
		});
	});

	const card = $derived<RecipeCard>({
		id: ed.originalId ?? 'preview',
		slug: ed.slug,
		title: recipe.title,
		titleLocal: recipe.titleLocal,
		summary: recipe.summary,
		servings: recipe.servings,
		tags: recipe.tags ?? [],
		difficulty: recipe.difficulty,
		section: [],
		times: {
			...recipe.times,
			total: Object.values(recipe.times ?? {}).reduce((sum, minutes) => sum + (minutes ?? 0), 0)
		},
		image: ed.photo ? undefined : ed.originalCard?.image
	});
</script>

<section class="preview" aria-labelledby="preview-title">
	<h2 id="preview-title" class="label">Preview</h2>
	{#if model}
		{#if ed.photo}
			<img class="photo" src={ed.photo.url} alt={ed.form.imageAlt} />
		{/if}
		<RecipeHeader
			{card}
			{model}
			hydrated={false}
			cookHref=""
			onshare={() => {}}
			onaddlist={() => {}}
			photoTools={false}
		/>
		<IngredientsPanel {model} {ticks} hydrated={false} />
		<MethodPanel {model} {ticks} hydrated={false} recipe={{ id: card.id, title: card.title }} />
		{#if model.view.tips.length}
			<aside class="tip">
				<h3 class="label">Chef's tip</h3>
				{#each model.view.tips as tip (tip)}<p>{tip}</p>{/each}
			</aside>
		{/if}
	{:else}
		<p class="help">
			The preview appears once the recipe has a title, a summary, servings, an ingredient and a
			step.
		</p>
	{/if}
</section>

<style>
	.preview {
		display: grid;
		gap: var(--space-5);
		align-content: start;
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-bg);
	}

	.preview :global(.actions) {
		display: none;
	}

	.photo {
		inline-size: 100%;
		aspect-ratio: 3 / 2;
		border-radius: var(--radius-m);
		object-fit: cover;
	}

	.tip {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
	}

	.tip .label {
		color: var(--colour-accent);
	}
</style>
