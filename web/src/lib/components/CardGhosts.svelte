<script lang="ts">
	/**
	 * Room for cards that are still being read from this browser, so the page below does not jump
	 * when they arrive. Hidden unless the script in app.html knows the list has cards; it then shows
	 * as many empty card shapes as there will be cards. `list` names which list it stands in for.
	 */
	let { list }: { list: 'mine' | 'favourites' | 'recent' } = $props();
</script>

<ul class="ghosts" data-ghosts={list} aria-hidden="true">
	{#each { length: 12 }, slot (slot)}<li></li>{/each}
</ul>

<style>
	.ghosts {
		display: none;
		grid-template-columns: var(--card-grid);
		gap: var(--space-4);
	}

	li {
		block-size: 10rem;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}
</style>
