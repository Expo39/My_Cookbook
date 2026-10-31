<script lang="ts">
	import { formatNumber } from '$lib/recipe/format';
	import type { RecipeModel } from '$lib/recipe/recipe-model.svelte';
	import Icon from './Icon.svelte';
	import ServingsStepper from './ServingsStepper.svelte';

	let { model, cookHref, onshare }: { model: RecipeModel; cookHref: string; onshare?: () => void } =
		$props();
</script>

<div class="bar" data-action-bar>
	<ServingsStepper
		label="Servings"
		value={formatNumber(model.view.servings)}
		canDecrease={model.view.servings > 1}
		onstep={(direction) => model.step(direction)}
	/>
	<a class="cook" href={cookHref} data-sveltekit-keepfocus data-sveltekit-noscroll
		><Icon name="play" size={18} />Start cooking</a
	>
	{#if onshare}
		<button type="button" aria-label="Share this recipe" onclick={onshare}>
			<Icon name="share" />
		</button>
	{/if}
</div>

<style>
	.bar {
		position: fixed;
		inset: auto 0 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-block-size: var(--bar-height);
		padding: var(--space-2) max(var(--space-3), env(safe-area-inset-right, 0px))
			calc(var(--space-2) + env(safe-area-inset-bottom, 0px))
			max(var(--space-3), env(safe-area-inset-left, 0px));
		border-block-start: 1px solid var(--colour-line);
		background: var(--colour-surface);
	}

	.bar :global(output) {
		min-inline-size: 2.25rem;
	}

	.cook {
		display: inline-flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		padding-inline: var(--space-3);
		border-radius: var(--radius-s);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
	}

	button {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: var(--target);
		block-size: var(--target);
		padding: 0;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: transparent;
		color: var(--colour-primary);
	}

	/* The page, footer and all, ends clear of the bar. */
	@media screen and (max-width: 47.99rem) {
		:global(body:has([data-action-bar])) {
			padding-block-end: calc(var(--bar-height) + env(safe-area-inset-bottom, 0px));
		}
	}

	@media (min-width: 48rem), print {
		.bar {
			display: none;
		}
	}
</style>
