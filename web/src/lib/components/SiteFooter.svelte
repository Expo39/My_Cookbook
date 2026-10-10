<script lang="ts">
	import { instagram } from '$lib/config';
	import Icon from './Icon.svelte';
</script>

<footer>
	<div class="inner">
		<blockquote>
			<p>Cooking is like love - it should be entered into with abandon or not at all.</p>
			<cite>Harriet Van Horne</cite>
		</blockquote>
		{#if instagram}
			<a class="social" href={instagram.url} rel="me noopener" target="_blank">
				<Icon name="instagram" />
				<span>More recipes on Instagram <strong>{instagram.handle}</strong></span>
			</a>
		{/if}
		<p class="copyright">Copyright 2026 Antonio</p>
	</div>
</footer>

<style>
	footer {
		margin-block-start: var(--space-8);
		border-block-start: 1px solid var(--colour-line);
	}

	.inner {
		display: grid;
		gap: var(--space-3);
		max-inline-size: var(--page-max);
		margin-inline: auto;
		padding: var(--space-6) var(--gutter) var(--space-6);
	}

	blockquote {
		margin: 0;
		max-inline-size: var(--measure);
		font-family: var(--font-display);
		font-size: var(--text-l);
		font-weight: 800;
		letter-spacing: 0.005em;
		line-height: 1.35;
		text-wrap: balance;
	}

	cite {
		display: block;
		margin-block-start: var(--space-2);
		color: var(--colour-muted);
		font-family: var(--font-body);
		font-size: var(--text-s);
		font-style: normal;
		font-weight: 400;
		letter-spacing: 0;
	}

	cite::before {
		content: '- ';
	}

	.social {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		justify-self: start;
		min-block-size: 44px;
		color: var(--colour-primary);
		font-weight: 700;
		text-decoration: none;
	}

	.social:hover strong,
	.social:focus-visible strong {
		text-decoration: underline;
	}

	.copyright {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	@media print {
		footer {
			display: none;
		}
	}
</style>
