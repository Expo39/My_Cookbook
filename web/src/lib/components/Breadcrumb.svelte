<script lang="ts">
	import Icon from './Icon.svelte';

	let { trail }: { trail: { label: string; href?: string }[] } = $props();
</script>

<nav aria-label="Breadcrumb">
	<ol>
		{#each trail as crumb (crumb.label)}
			<li class:here={!crumb.href}>
				{#if crumb.href}
					<a href={crumb.href}>{crumb.label}</a>
					<Icon name="chevronRight" size={14} />
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
		font-size: var(--text-s);
	}

	/* The whole trail, wrapped onto more lines when it must, never cut short with an ellipsis. */
	ol {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: var(--space-2);
		color: var(--colour-muted);
	}

	li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	li :global(svg) {
		flex: none;
	}

	a {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--target);
		overflow-wrap: anywhere;
		font-weight: 700;
	}

	span {
		color: var(--colour-ink);
		overflow-wrap: anywhere;
	}

	/* On a phone the page title sits right below, so the trail stops at the parent. */
	@media (max-width: 39.99rem) {
		.here {
			display: none;
		}

		li:nth-last-child(2) :global(svg) {
			display: none;
		}
	}

	@media print {
		nav {
			display: none;
		}
	}
</style>
