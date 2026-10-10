<script lang="ts">
	import Icon from './Icon.svelte';

	let { trail }: { trail: { label: string; href?: string }[] } = $props();
</script>

<nav aria-label="Breadcrumb">
	<ol>
		{#each trail as crumb, position (crumb.label)}
			<li>
				{#if position > 0}<Icon name="chevronRight" size={14} />{/if}
				{#if crumb.href}
					<a href={crumb.href}>{crumb.label}</a>
				{:else}
					<span aria-current="page">{crumb.label}</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	ol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	a {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--target);
		min-inline-size: var(--target);
		justify-content: center;
	}

	span {
		color: var(--colour-ink);
	}
</style>
