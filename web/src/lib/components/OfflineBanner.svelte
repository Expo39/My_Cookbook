<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	let offline = $state(false);

	onMount(() => {
		const update = () => (offline = !navigator.onLine);
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});
</script>

<div role="status">
	{#if offline}
		<p><Icon name="wifiOff" size={18} />You're offline: showing saved recipes</p>
	{/if}
</div>

<style>
	p {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--gutter);
		background: var(--colour-tint);
		color: var(--colour-ink);
		font-size: var(--text-s);
	}

	@media print {
		p {
			display: none;
		}
	}
</style>
