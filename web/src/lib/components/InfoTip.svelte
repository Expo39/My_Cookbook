<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * A small "i" beside a label or heading. With a mouse, hovering or focusing it shows the
	 * explanation in a bubble; on a touch screen a tap opens it on a line of its own underneath,
	 * since the "i" sits in a wrapping flex row.
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
	data-tip={text}
	onclick={() => (open = !open)}
>
	<Icon name="info" size={18} />
</button>
<p {id} class="tip" hidden={!open}>{text}</p>

<style>
	.info {
		position: relative;
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		margin-block: calc((var(--target) - 1.5rem) / -2);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--colour-primary);
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

	@media (hover: hover) and (pointer: fine) {
		.info {
			inline-size: 1.75rem;
			block-size: 1.75rem;
			margin-block: 0;
			cursor: help;
		}

		.tip {
			display: none;
		}

		.info:hover::after,
		.info:focus-visible::after {
			content: attr(data-tip);
			position: absolute;
			inset-block-start: calc(100% + var(--space-1));
			inset-inline-start: calc(-1 * var(--space-2));
			z-index: 20;
			inline-size: max-content;
			max-inline-size: min(20rem, 80vw);
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-s);
			background: var(--colour-ink);
			box-shadow: var(--shadow-float);
			color: var(--colour-bg);
			font-family: var(--font-body);
			font-size: var(--text-s);
			font-weight: 400;
			letter-spacing: 0;
			line-height: 1.45;
			text-align: start;
			text-transform: none;
			white-space: normal;
		}
	}
</style>
