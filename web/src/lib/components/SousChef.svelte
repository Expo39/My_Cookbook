<script lang="ts">
	import { tick } from 'svelte';
	import { AiError, type AiClient, type Turn } from '$lib/ai';
	import type { Recipe } from '$lib/types/recipe';
	import Icon from './Icon.svelte';

	let { client, recipeId, recipe }: { client: AiClient; recipeId: string; recipe: Recipe } =
		$props();

	const id = $props.id();
	const suggestions = ['Can I make this ahead?', 'How do I know when it is done?'];

	let dialog: HTMLDialogElement;
	let log: HTMLOListElement | undefined = $state();
	let messages = $state<(Turn & { truncated?: boolean })[]>([]);
	let question = $state('');
	let sending = $state(false);
	let error = $state('');

	export function show() {
		dialog.showModal();
	}

	async function toEnd() {
		await tick();
		log?.scrollTo({ top: log.scrollHeight });
	}

	async function ask(text: string) {
		const asked = text.trim();
		if (!asked || sending) return;
		const history = messages.map(({ role, text }) => ({ role, text }));
		messages.push({ role: 'user', text: asked });
		question = '';
		error = '';
		sending = true;
		void toEnd();
		try {
			const answer = await client.chat({ recipeId, recipe, history, question: asked });
			messages.push({ role: 'model', text: answer.reply, truncated: answer.truncated });
		} catch (failure) {
			messages.pop();
			question = asked;
			error =
				failure instanceof AiError
					? failure.message
					: 'The sous-chef could not answer just now. Try again in a moment.';
		} finally {
			sending = false;
			void toEnd();
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void ask(question);
	}

	function enter(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			void ask(question);
		}
	}
</script>

<!-- Escape and the close button already work; a click on the backdrop is a convenience for the pointer. -->
<dialog
	bind:this={dialog}
	aria-labelledby="{id}-title"
	onclick={(event) => event.target === dialog && dialog.close()}
>
	<div class="panel">
		<div class="head">
			<h2 id="{id}-title">Ask the sous-chef</h2>
			<button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}>
				<Icon name="x" />
			</button>
		</div>
		<p class="note">
			Answers come from AI and may be wrong. Check times and temperatures yourself.
		</p>

		<ol class="log" role="log" aria-label="Conversation" bind:this={log}>
			{#each messages as message, i (i)}
				<li class={message.role}>
					<span class="who">{message.role === 'user' ? 'You' : 'Sous-chef'}</span>
					<p>{message.text}</p>
					{#if message.truncated}
						<p class="cut">The answer was cut short. Ask again for the rest.</p>
					{/if}
				</li>
			{:else}
				<li class="empty">
					<p>Ask about this recipe: swaps, timings, make-ahead tips.</p>
					<ul>
						{#each suggestions as suggestion (suggestion)}
							<li>
								<button type="button" class="chip" onclick={() => ask(suggestion)}
									>{suggestion}</button
								>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
			{#if sending}
				<li class="model typing" aria-live="polite">
					<span class="who">Sous-chef</span>
					<p>Thinking...</p>
				</li>
			{/if}
		</ol>

		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<form onsubmit={submit}>
			<label for="{id}-question">Your question</label>
			<div class="row">
				<textarea
					id="{id}-question"
					rows="2"
					maxlength="1000"
					bind:value={question}
					onkeydown={enter}
				></textarea>
				<button type="submit" class="send" disabled={sending || !question.trim()}>
					<Icon name="send" />Send
				</button>
			</div>
		</form>
	</div>
</dialog>

<style>
	dialog {
		inset: auto 0 0;
		inline-size: 100%;
		max-inline-size: none;
		block-size: min(40rem, 92dvh);
		max-block-size: none;
		margin: 0;
		padding: 0;
		border: 0;
		border-block-start: 1px solid var(--colour-line);
		border-radius: var(--radius-m) var(--radius-m) 0 0;
		background: var(--colour-surface);
		color: var(--colour-ink);
		box-shadow: var(--shadow-float);
	}

	dialog[open] {
		display: grid;
		animation: rise var(--duration-panel) var(--ease-out);
	}

	dialog::backdrop {
		background: var(--colour-scrim);
	}

	.panel {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto auto;
		gap: var(--space-3);
		min-block-size: 0;
		padding: var(--space-4) var(--space-4) max(var(--space-4), env(safe-area-inset-bottom, 0px));
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.note {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.log {
		display: grid;
		align-content: start;
		gap: var(--space-3);
		min-block-size: 0;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.log > li {
		display: grid;
		gap: var(--space-1);
		max-inline-size: 90%;
		padding: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
	}

	.user {
		justify-self: end;
		background: var(--colour-tint);
	}

	.model {
		justify-self: start;
		background: var(--colour-bg);
	}

	.who {
		color: var(--colour-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.log p {
		white-space: pre-wrap;
	}

	.typing p,
	.cut {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.empty {
		justify-self: stretch;
		max-inline-size: none;
		border-style: dashed;
		color: var(--colour-muted);
	}

	.empty ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.error {
		padding: var(--space-3);
		border: 1px solid var(--colour-warning);
		border-radius: var(--radius-s);
		color: var(--colour-warning);
	}

	label {
		display: block;
		margin-block-end: var(--space-1);
		color: var(--colour-muted);
		font-size: var(--text-s);
		font-weight: 700;
	}

	.row {
		display: flex;
		align-items: stretch;
		gap: var(--space-2);
	}

	textarea {
		flex: 1;
		min-inline-size: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-bg);
		color: inherit;
		font: inherit;
		resize: none;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-block-size: var(--target);
		padding-inline: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
		color: var(--colour-primary);
		font-weight: 700;
	}

	button:hover:not(:disabled) {
		background: var(--colour-tint);
	}

	button:disabled {
		opacity: 0.6;
	}

	.send {
		border-color: var(--colour-primary);
		background: var(--colour-primary);
		color: var(--colour-on-primary);
	}

	.send:hover:not(:disabled) {
		background: var(--colour-primary);
	}

	.chip {
		border-radius: var(--radius-pill);
		font-weight: 400;
	}

	.close {
		inline-size: var(--target);
		padding: 0;
		border: 0;
		background: transparent;
	}

	@keyframes rise {
		from {
			transform: translateY(2rem);
			opacity: 0;
		}
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}
	}

	@media (min-width: 48rem) {
		dialog {
			inset: 0 0 0 auto;
			inline-size: min(26rem, 100vw);
			block-size: 100dvh;
			border-block-start: 0;
			border-inline-start: 1px solid var(--colour-line);
			border-radius: 0;
		}

		dialog[open] {
			animation-name: slide-in;
		}
	}
</style>
