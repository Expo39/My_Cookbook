<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * A small "i" that opens a plain explanation underneath. It sits in a wrapping flex row beside a
	 * label or heading; the note takes a line of its own, so it reads the same on a phone and a desk.
	 */
	let { topic, text }: { topic: string; text: string } = $props();

	const id = $props.id();
	let open = $state(false);
</script>

<button
	type="button"
	class="info"
	aria-label="What is {topic}?"
	aria-expanded={open}
	aria-controls={id}
	onclick={() => (open = !open)}
>
	<Icon name="info" size={18} />
</button>
<p {id} class="tip" hidden={!open}>{text}</p>

<style>
	.info {
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		margin-block: calc((var(--target) - 1.5rem) / -2);
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--colour-primary);
	}

	.info:hover,
	.info[aria-expanded='true'] {
		background: var(--colour-tint);
	}

	.tip {
		flex-basis: 100%;
		padding: var(--space-2) var(--space-3);
		border-inline-start: 3px solid var(--colour-primary);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		color: var(--colour-ink);
		font-size: var(--text-s);
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}
</style>
