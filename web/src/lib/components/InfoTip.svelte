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

	/**
	 * The bubble starts at the "i" and runs right; near the screen's right edge it moves left just
	 * enough to stay on screen, so it never runs off the page or makes it scroll sideways.
	 */
	function place(event: Event) {
		const button = event.currentTarget as HTMLElement;
		const margin = 16;
		const width = Math.min(320, innerWidth * 0.8);
		const left = button.getBoundingClientRect().left - 8;
		const shift = Math.max(margin - left, Math.min(0, innerWidth - margin - (left + width)));
		button.style.setProperty('--tip-shift', `${shift}px`);
	}
</script>

<button
	type="button"
	class="info"
	aria-label="What is {topic}?"
	aria-expanded={open}
	aria-controls={id}
	data-tip={text}
	onpointerenter={place}
	onfocus={place}
	onclick={(event) => {
		// Inside a <summary> a click would also open or close its box; the "i" keeps it to itself.
		event.preventDefault();
		event.stopPropagation();
		open = !open;
	}}
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

	/* Its width never counts towards the row it opens in, so opening it moves the content below
	   down and never pushes the "i" or rewraps the label beside it. */
	.tip {
		flex-basis: 100%;
		contain: inline-size;
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
		}

		.tip {
			display: none;
		}

		.info:hover::after,
		.info:focus-visible::after {
			content: attr(data-tip);
			position: absolute;
			inset-block-start: calc(100% + var(--space-1));
			inset-inline-start: calc(-1 * var(--space-2) + var(--tip-shift, 0px));
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
