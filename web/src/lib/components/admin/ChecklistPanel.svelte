<script lang="ts">
	import '$lib/styles/admin.css';
	import { checkGroups, summarise } from '$lib/admin/checklist';
	import type { EditorState } from '$lib/admin/editor-state.svelte';
	import Icon from '../Icon.svelte';

	let { ed, onjump }: { ed: EditorState; onjump: (path: string) => void } = $props();

	const groups = $derived(checkGroups(ed.results));
</script>

<section class="panel" aria-labelledby="checklist-title">
	<h2 id="checklist-title">Checklist</h2>
	{#if ed.coreReady}
		<p class="summary" class:bad={ed.errors.length > 0} role="status">
			{summarise(ed.errors.length, ed.warnings.length)}
		</p>
	{:else}
		<p class="summary" role="status">Loading the checks…</p>
	{/if}

	<ul class="groups">
		{#each groups as group (group.id)}
			{@const failed = group.results.length > 0}
			<li>
				<p
					class="group"
					class:failed={failed && group.level === 'error'}
					class:advice={failed && group.level === 'warning'}
				>
					<Icon
						name={!failed ? 'checkCircle' : group.level === 'error' ? 'xCircle' : 'alert'}
						size={20}
					/>
					{group.label}
				</p>
				{#if failed}
					<ul class="results">
						{#each group.results as result, index (index)}
							<li>
								<button type="button" class="link" onclick={() => onjump(ed.pathOf(result))}>
									{result.message}
								</button>
								<span class="code">{result.id}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
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
		font-weight: 700;
	}

	.summary.bad {
		color: var(--colour-danger);
	}

	.groups,
	.results {
		display: grid;
		gap: var(--space-2);
	}

	.group {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--colour-success);
		font-weight: 700;
	}

	.group.failed {
		color: var(--colour-danger);
	}

	.group.advice {
		color: var(--colour-warning);
	}

	.results {
		margin-inline-start: calc(20px + var(--space-2));
	}

	.link {
		min-block-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-ink);
		text-align: start;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.code {
		display: block;
		color: var(--colour-muted);
		font-size: var(--text-xs);
	}
</style>
