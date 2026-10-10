<script lang="ts">
	import '$lib/styles/admin.css';
	import { onMount } from 'svelte';
	import { MIN_PASSWORD, WrongPasswordError } from '$lib/admin/crypto';
	import { admin, NotSetUpError } from '$lib/admin/session.svelte';
	import { editHref } from '$lib/links';
	import Icon from '../Icon.svelte';
	import TextField from './TextField.svelte';

	let { onnavigate, lazy = false }: { onnavigate?: () => void; lazy?: boolean } = $props();

	const uid = $props.id();
	let busy = $state(false);
	let problem = $state('');
	let done = $state('');

	let token = $state('');
	let password = $state('');
	let repeat = $state('');
	let aiSecret = $state('');
	let current = $state('');
	let next = $state('');

	/** Looks for the published editing key; a page that is not about editing waits until it is asked. */
	export function check() {
		void admin.checkConfigured();
	}

	onMount(() => {
		void admin.restore();
		if (!lazy) check();
	});

	function reset() {
		token = password = repeat = aiSecret = current = next = '';
		problem = done = '';
	}

	function explain(error: unknown): string {
		if (error instanceof WrongPasswordError) {
			return 'That password did not work. Check it and try again.';
		}
		if (error instanceof NotSetUpError) return error.message;
		return error instanceof Error ? error.message : 'Something went wrong. Try again.';
	}

	async function run(action: () => Promise<void>, message = '') {
		busy = true;
		problem = done = '';
		try {
			await action();
			reset();
			done = message;
		} catch (error) {
			problem = explain(error);
		} finally {
			busy = false;
		}
	}

	function checkNew(next: string, again: string): string {
		if (next.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
		return next === again ? '' : 'The two passwords are not the same.';
	}

	function setUp(event: SubmitEvent) {
		event.preventDefault();
		problem = token.trim() ? checkNew(password, repeat) : 'Paste the GitHub token first.';
		if (problem) return;
		void run(
			() => admin.setUp({ token, password, aiImportSecret: aiSecret }),
			'Editing is set up and unlocked. The key file goes live with the next deploy.'
		);
	}

	function unlock(event: SubmitEvent) {
		event.preventDefault();
		if (!password) {
			problem = 'Enter the password.';
			return;
		}
		void run(() => admin.unlock(password));
	}

	function changePassword(event: SubmitEvent) {
		event.preventDefault();
		problem = checkNew(next, repeat);
		if (problem) return;
		const chosen = next;
		void run(() => admin.changePassword(current, chosen), 'Password changed.');
	}

	function replaceToken(event: SubmitEvent) {
		event.preventDefault();
		problem = token.trim() || aiSecret.trim() ? '' : 'Enter a new token or secret.';
		if (problem) return;
		void run(
			() => admin.replaceSecrets(password, { token, aiImportSecret: aiSecret }),
			'Saved. The new key file goes live with the next deploy.'
		);
	}
</script>

<section class="admin" aria-labelledby="{uid}-title">
	<h3 id="{uid}-title" class="label">Editing</h3>

	{#if admin.configured === null && !admin.unlocked}
		<p class="help">Looking for the editing key...</p>
	{:else if admin.unlocked}
		<p class="state"><Icon name="lock" size={18} />Editing is unlocked.</p>
		<a class="btn primary" href={editHref()} onclick={onnavigate}>
			<Icon name="plus" size={18} />New recipe
		</a>
		<button type="button" class="btn" onclick={() => admin.lock()}>Lock editing</button>
		{#if !admin.server}
			<details ontoggle={reset}>
				<summary>Change the password</summary>
				<form onsubmit={changePassword}>
					<TextField
						id="{uid}-current"
						label="Current password"
						type="password"
						bind:value={current}
						autocomplete="current-password"
					/>
					<TextField
						id="{uid}-new"
						label="New password"
						type="password"
						bind:value={next}
						autocomplete="new-password"
						hint="At least {MIN_PASSWORD} characters."
					/>
					<TextField
						id="{uid}-repeat"
						label="Repeat the new password"
						type="password"
						bind:value={repeat}
						autocomplete="new-password"
					/>
					<button class="btn" disabled={busy}>Change password</button>
				</form>
			</details>
			<details ontoggle={reset}>
				<summary>Replace the token or AI secret</summary>
				<form onsubmit={replaceToken}>
					<TextField
						id="{uid}-token"
						label="New GitHub token"
						type="password"
						bind:value={token}
						optional
						hint="A fine-grained token for this repository, with Contents set to read and write."
					/>
					<TextField
						id="{uid}-secret"
						label="AI import secret"
						type="password"
						bind:value={aiSecret}
						optional
						hint="Leave blank to keep the current one."
					/>
					<TextField
						id="{uid}-pw"
						label="Password"
						type="password"
						bind:value={password}
						autocomplete="current-password"
					/>
					<button class="btn" disabled={busy}>Save</button>
				</form>
			</details>
		{/if}
	{:else if admin.configured}
		<form onsubmit={unlock}>
			<TextField
				id="{uid}-unlock"
				label="Password"
				type="password"
				bind:value={password}
				autocomplete="current-password"
			/>
			<button class="btn primary" disabled={busy}>
				<Icon name="lock" size={18} />{busy ? 'Unlocking...' : 'Unlock editing'}
			</button>
		</form>
	{:else}
		<p class="help">
			Editing has not been set up yet. This happens once: the token and password stay out of the
			repository, apart from an encrypted copy that lets any of your devices unlock editing.
		</p>
		<form onsubmit={setUp}>
			<TextField
				id="{uid}-token"
				label="GitHub token"
				type="password"
				bind:value={token}
				hint="A fine-grained token for this repository only, with Contents set to read and write."
			/>
			<TextField
				id="{uid}-pw"
				label="Password"
				type="password"
				bind:value={password}
				autocomplete="new-password"
				hint="At least {MIN_PASSWORD} characters. The encrypted file is public, so a long password is the only thing that protects the token."
			/>
			<TextField
				id="{uid}-repeat"
				label="Repeat the password"
				type="password"
				bind:value={repeat}
				autocomplete="new-password"
			/>
			<TextField
				id="{uid}-ai"
				label="AI import secret"
				type="password"
				bind:value={aiSecret}
				optional
				hint="Only if the recipe importer is set up on the Worker."
			/>
			<button class="btn primary" disabled={busy}
				>{busy ? 'Setting up...' : 'Set up editing'}</button
			>
		</form>
	{/if}

	{#if problem}
		<p class="error" role="alert"><Icon name="alert" size={16} />{problem}</p>
	{/if}
	{#if done}<p class="help" role="status">{done}</p>{/if}
</section>

<style>
	.admin,
	form {
		display: grid;
		gap: var(--space-3);
	}

	.admin .label {
		color: var(--colour-muted);
	}

	.state {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--colour-success);
		font-weight: 700;
	}

	summary {
		display: flex;
		align-items: center;
		min-block-size: var(--target);
		color: var(--colour-primary);
		font-weight: 700;
		cursor: pointer;
	}

	details form {
		padding-block: var(--space-2) var(--space-3);
	}
</style>
