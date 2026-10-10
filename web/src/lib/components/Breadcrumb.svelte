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
	nav {
		min-inline-size: 0;
	}

	ol {
		display: flex;
		gap: var(--space-2);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	/* One line: the crumbs share the width and shorten with an ellipsis, Home and the chevrons never do. */
	li {
		display: flex;
		flex: 0 1 auto;
		align-items: center;
		gap: var(--space-2);
		min-inline-size: 0;
	}

	li:first-child {
		flex: none;
	}

	li :global(svg) {
		flex: none;
	}

	a,
	span {
		display: block;
		min-inline-size: var(--target);
		overflow: hidden;
		line-height: var(--target);
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	span {
		color: var(--colour-ink);
	}
</style>
