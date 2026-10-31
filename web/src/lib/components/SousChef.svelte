<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { admin } from '$lib/admin/session.svelte';
	import { AiError, isRetryable, type AiClient, type Turn } from '$lib/ai';
	import type { Recipe } from '$lib/types/recipe';
	import Icon from './Icon.svelte';

	let { client, recipeId, recipe }: { client: AiClient; recipeId: string; recipe: Recipe } =
		$props();

	const id = $props.id();
	const suggestions = ['Can I make this ahead?', 'How do I know when it is done?'];
	/** An answer that has not finished by then is given up, and the cook can ask again. */
	const LIMIT_MILLISECONDS = 45_000;
	/** "Still thinking" replaces "Thinking" once a reply is this slow to start. */
	const PATIENT_SECONDS = 4;
	const RETRY_MILLISECONDS = 1200;

	interface Message extends Turn {
		truncated?: boolean;
		/** The question got no answer; it is kept so it can be asked again. */
		failed?: boolean;
		/** The answer is still arriving. */
		streaming?: boolean;
		/** The model that wrote the answer, and whether it stood in for the main one. */
		model?: string;
		fallback?: boolean;
	}

	let dialog: HTMLDialogElement;
	let log: HTMLOListElement | undefined = $state();
	let messages = $state<Message[]>([]);
	let question = $state('');
	let sending = $state(false);
	let error = $state('');
	let seconds = $state(0);
	/** A lighter model is answering because the main one is too busy. */
	let lighter = $state(false);
	let controller: AbortController | undefined;

	/**
	 * Whether the sous-chef can answer, checked the moment it opens so a cook knows before asking.
	 * Only "offline" and "unreachable" stop a question; everything else in the cookbook works regardless.
	 */
	type Reach = 'checking' | 'ready' | 'busy' | 'offline' | 'unreachable';
	let reach = $state<Reach>('checking');
	const blocked = $derived(reach === 'offline' || reach === 'unreachable');
	/** Shown only to the owner, who is the one who can change the model. */
	let retired = $state<string>();
	const CHECK_MILLISECONDS = 5000;

	async function check() {
		if (!navigator.onLine) {
			reach = 'offline';
			return;
		}
		reach = 'checking';
		try {
			const status = await client.status(AbortSignal.timeout(CHECK_MILLISECONDS));
			reach = status.busy ? 'busy' : 'ready';
			retired = status.retired;
		} catch {
			reach = navigator.onLine ? 'unreachable' : 'offline';
		}
	}

	export function show() {
		dialog.showModal();
		void admin.restore();
		void check();
	}

	async function toEnd() {
		await tick();
		log?.scrollTo({ top: log.scrollHeight });
	}

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	async function ask(text: string) {
		const asked = text.trim();
		if (!asked || sending || blocked) return;
		// A question that got no answer is dropped from what the sous-chef reads, and from the log.
		messages = messages.filter((message) => !message.failed);
		const history = messages.map(({ role, text }) => ({ role, text }));
		messages.push({ role: 'user', text: asked });
		const asking = messages.length - 1;
		question = '';
		error = '';
		sending = true;
		seconds = 0;
		lighter = false;
		const clock = setInterval(() => seconds++, 1000);
		void toEnd();
		try {
			for (let attempt = 0; ; attempt++) {
				const answer = messages.length;
				let by: Pick<Message, 'model' | 'fallback'> = {};
				controller = new AbortController();
				const timer = setTimeout(() => controller?.abort(), LIMIT_MILLISECONDS);
				try {
					const reply = await client.chat(
						{ recipeId, recipe, history, question: asked },
						{
							signal: controller.signal,
							onFallback: () => (lighter = true),
							onModel: (model, fallback) => (by = { model, fallback }),
							onText: (sofar) => {
								if (messages.length === answer) {
									messages.push({ role: 'model', text: '', streaming: true });
								}
								messages[answer].text = sofar;
								void toEnd();
							}
						}
					);
					if (messages.length === answer) messages.push({ role: 'model', text: '' });
					messages[answer] = {
						role: 'model',
						text: reply.reply,
						truncated: reply.truncated,
						...by
					};
					reach = 'ready';
					return;
				} catch (failure) {
					const started = messages.length > answer;
					const timedOut = controller.signal.aborted;
					if (started) messages.splice(answer, 1);
					const retry =
						!started &&
						!timedOut &&
						attempt === 0 &&
						failure instanceof AiError &&
						isRetryable(failure);
					if (!retry) {
						messages[asking].failed = true;
						if (failure instanceof AiError && failure.code === 'offline') {
							reach = navigator.onLine ? 'unreachable' : 'offline';
						} else if (failure instanceof AiError && isRetryable(failure)) {
							reach = 'busy';
						}
						error = timedOut
							? 'The sous-chef is taking too long to answer. Try again.'
							: failure instanceof AiError
								? failure.message
								: 'The sous-chef could not answer just now. Try again in a moment.';
						return;
					}
					await wait(RETRY_MILLISECONDS);
				} finally {
					clearTimeout(timer);
				}
			}
		} finally {
			clearInterval(clock);
			controller = undefined;
			sending = false;
			void toEnd();
		}
	}

	function again() {
		const last = messages.findLast((message) => message.failed);
		if (last) void ask(last.text);
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

	onMount(() => {
		const changed = () => dialog.open && void check();
		window.addEventListener('online', changed);
		window.addEventListener('offline', changed);
		return () => {
			window.removeEventListener('online', changed);
			window.removeEventListener('offline', changed);
		};
	});

	/*
	 * A phone keyboard covers the bottom of the page in browsers that do not resize the layout for it
	 * (Safari ignores `interactive-widget`), so the sheet is lifted by the part of the window it hides.
	 */
	onMount(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;
		const lift = () => {
			const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
			dialog.style.setProperty('--keyboard', `${Math.max(0, Math.round(hidden))}px`);
			dialog.style.setProperty('--visible', `${Math.round(viewport.height)}px`);
		};
		lift();
		viewport.addEventListener('resize', lift);
		viewport.addEventListener('scroll', lift);
		return () => {
			viewport.removeEventListener('resize', lift);
			viewport.removeEventListener('scroll', lift);
		};
	});
</script>

<!-- Escape and the close button already work; a click on the backdrop is a convenience for the pointer. -->
<dialog
	bind:this={dialog}
	aria-labelledby="{id}-title"
	onclick={(event) => event.target === dialog && dialog.close()}
	onclose={() => controller?.abort()}
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

		{#if retired && admin.unlocked}
			<div class="reach" role="status">
				<Icon name="info" size={20} />
				<p>
					<strong>For the owner: Gemini no longer offers "{retired}".</strong> The sous-chef is
					answering with the fallback model meanwhile. Set <code>GEMINI_MODEL</code> in
					<code>crates/cookbook-worker/wrangler.toml</code> to a current model, then run
					<code>make worker-deploy</code>.
				</p>
			</div>
		{/if}

		{#if reach === 'offline'}
			<div class="reach" role="status">
				<Icon name="wifiOff" size={20} />
				<p>
					<strong>You're offline.</strong> The sous-chef needs the internet. The recipe, timers and shopping
					list all keep working.
				</p>
			</div>
		{:else if reach === 'unreachable'}
			<div class="reach" role="status">
				<Icon name="alert" size={20} />
				<p>
					<strong>The sous-chef can't be reached right now.</strong> Everything else in the cookbook works
					as normal.
				</p>
				<button type="button" class="retry" onclick={check}>
					<Icon name="reset" size={18} />Check again
				</button>
			</div>
		{:else if reach === 'busy'}
			<div class="reach" role="status">
				<Icon name="clock" size={20} />
				<p>
					<strong>The AI is in high demand right now.</strong> Answers may come from a lighter model,
					or not at all. If so, try again in a few minutes.
				</p>
			</div>
		{/if}

		<ol class="log" role="log" aria-label="Conversation" bind:this={log}>
			{#each messages as message, i (i)}
				<li class={message.role} class:failed={message.failed}>
					<span class="who">{message.role === 'user' ? 'You' : 'Sous-chef'}</span>
					<p>
						{message.text}{#if message.streaming}<span class="caret" aria-hidden="true"></span>{/if}
					</p>
					{#if message.truncated}
						<p class="cut">The answer was cut short. Ask again for the rest.</p>
					{/if}
					{#if message.model}
						<p class="cut">
							{message.fallback
								? `Answered by the lighter model, ${message.model}, because the main one could not answer.`
								: `Answered by ${message.model}.`}
						</p>
					{/if}
				</li>
			{:else}
				<li class="empty">
					<p>Ask about this recipe: swaps, timings, make-ahead tips.</p>
					<ul>
						{#each suggestions as suggestion (suggestion)}
							<li>
								<button
									type="button"
									class="chip"
									disabled={blocked}
									onclick={() => ask(suggestion)}>{suggestion}</button
								>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
			{#if sending && !messages.at(-1)?.streaming}
				<li class="model typing" aria-live="polite">
					<span class="who">Sous-chef</span>
					<p>
						<span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>
						<span>
							{#if lighter}
								High demand: switching to a lighter model...
							{:else if seconds < PATIENT_SECONDS}
								Thinking...
							{:else}
								Still thinking... <span class="num">{seconds}</span>&nbsp;s
							{/if}
						</span>
					</p>
				</li>
			{/if}
		</ol>

		{#if error}
			<div class="error" role="alert">
				<p>{error}</p>
				{#if messages.some((message) => message.failed)}
					<button type="button" class="retry" onclick={again} disabled={sending}>
						<Icon name="reset" size={18} />Try again
					</button>
				{/if}
			</div>
		{/if}

		<form onsubmit={submit}>
			<label for="{id}-question">Your question</label>
			<div class="row">
				<textarea
					id="{id}-question"
					rows="2"
					maxlength="1000"
					bind:value={question}
					disabled={blocked}
					onkeydown={enter}
				></textarea>
				<button type="submit" class="send" disabled={sending || blocked || !question.trim()}>
					<Icon name="send" />Send
				</button>
			</div>
		</form>
	</div>
</dialog>

<style>
	dialog {
		inset: auto 0 var(--keyboard, 0px);
		inline-size: 100%;
		max-inline-size: none;
		block-size: min(40rem, 92dvh, calc(var(--visible, 100dvh) * 0.92));
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

	/* A column whose conversation takes the room left, whichever notices sit above or below it. */
	.panel {
		display: flex;
		flex-direction: column;
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
		flex: 1;
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

	.typing p {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.num {
		font-family: var(--font-num);
		font-variant-numeric: tabular-nums;
	}

	.dots {
		display: inline-flex;
		gap: 3px;
	}

	.dots span {
		inline-size: 6px;
		block-size: 6px;
		border-radius: 50%;
		background: var(--colour-primary);
		animation: bounce 1.2s var(--ease-out) infinite;
	}

	.dots span:nth-child(2) {
		animation-delay: 0.15s;
	}

	.dots span:nth-child(3) {
		animation-delay: 0.3s;
	}

	.caret {
		display: inline-block;
		inline-size: 0.5em;
		block-size: 1em;
		margin-inline-start: 2px;
		vertical-align: -0.15em;
		background: var(--colour-primary);
		animation: blink 1s steps(2) infinite;
	}

	.failed {
		opacity: 0.7;
		border-style: dashed;
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
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--colour-warning);
		border-radius: var(--radius-s);
		color: var(--colour-warning);
	}

	.retry {
		flex: none;
	}

	.reach {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3);
		border-inline-start: 3px solid var(--colour-warning);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		font-size: var(--text-s);
	}

	.reach > :global(svg) {
		flex: none;
		color: var(--colour-warning);
	}

	.reach p {
		flex: 1 1 14rem;
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

	@keyframes bounce {
		0%,
		60%,
		100% {
			transform: none;
			opacity: 0.4;
		}

		30% {
			transform: translateY(-4px);
			opacity: 1;
		}
	}

	@keyframes blink {
		to {
			visibility: hidden;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dots span,
		.caret {
			animation: none;
		}
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
