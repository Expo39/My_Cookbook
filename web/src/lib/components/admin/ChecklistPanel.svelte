<script lang="ts">
	import '$lib/styles/admin.css';
	import { plainWords, summarise } from '$lib/admin/checklist';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import type { CheckResult } from '$lib/types/recipe';
	import Icon from '../Icon.svelte';

	/**
	 * What is left before the recipe can be saved, as a short calm list: each line says what to do
	 * and takes the cook to the place. Suggestions wait, folded, below.
	 */
	let { ed, onjump }: { ed: EditorState; onjump: (path: string) => void } = $props();
</script>

{#snippet items(results: CheckResult[])}
	<ul>
		{#each results as result, index (index)}
			<li>
				<button type="button" class="link" onclick={() => onjump(ed.pathOf(result))}>
					{plainWords(result)}
				</button>
			</li>
		{/each}
	</ul>
{/snippet}

<section class="panel" aria-labelledby="checklist-title">
	<h2 id="checklist-title">Before you save</h2>
	{#if !ed.coreReady}
		<p role="status">Getting ready...</p>
	{:else}
		<p class="summary" class:ready={!ed.errors.length} role="status">
			{#if !ed.errors.length}<Icon name="checkCircle" size={20} />{/if}{summarise(
				ed.errors.length
			)}{#if ed.errors.length}:{/if}
		</p>
		{#if ed.errors.length}{@render items(ed.errors)}{/if}
		{#if ed.warnings.length}
			<details>
				<summary>Suggestions, if you like ({ed.warnings.length})</summary>
				{@render items(ed.warnings)}
			</details>
		{/if}
	{/if}
</section>

<style>
	.panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	h2 {
		font-size: var(--text-xl);
	}

	.summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 700;
	}

	.summary.ready {
		color: var(--colour-success);
	}

	ul {
		display: grid;
		counter-reset: left;
	}

	li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		counter-increment: left;
	}

	li::before {
		content: counter(left);
		display: grid;
		flex: none;
		place-items: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		border-radius: var(--radius-pill);
		background: var(--colour-tint);
		color: var(--colour-primary);
		font-family: var(--font-num);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.link {
		min-block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-ink);
		text-align: start;
		text-decoration: underline;
		text-decoration-color: var(--colour-line);
		text-underline-offset: 0.25em;
	}

	.link:hover {
		color: var(--colour-primary);
		text-decoration-color: currentcolor;
	}

	summary {
		min-block-size: var(--target);
		align-content: center;
		color: var(--colour-primary);
		font-weight: 700;
	}
</style>
