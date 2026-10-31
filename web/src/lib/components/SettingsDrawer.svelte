<script lang="ts">
	import { tick } from 'svelte';
	import { admin } from '$lib/admin/session.svelte';
	import { howToHref } from '$lib/links';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { theme, type Theme } from '$lib/stores/theme.svelte';
	import type { UnitSystem } from '$lib/types/recipe';
	import AdminPanel from './admin/AdminPanel.svelte';
	import Icon from './Icon.svelte';
	import PersonalPanel from './PersonalPanel.svelte';
	import Segmented from './Segmented.svelte';

	let dialog: HTMLDialogElement;
	let adminPanel: AdminPanel;
	let ownerOpen = $state(false);

	export function show() {
		ownerOpen ||= admin.unlocked;
		dialog.showModal();
		adminPanel.check();
	}

	const close = () => dialog.close();

	async function openOwner() {
		ownerOpen = true;
		await tick();
		adminPanel.reveal();
	}
</script>

<!-- Escape and the close button already work; a click on the backdrop is a convenience for the pointer. -->
<dialog
	bind:this={dialog}
	aria-labelledby="settings-title"
	onclick={(event) => event.target === dialog && close()}
>
	<header class="head">
		<h2 id="settings-title">Settings</h2>
		<button type="button" class="close" aria-label="Close settings" onclick={close}>
			<Icon name="x" />
		</button>
	</header>

	<div class="body">
		<section class="card" aria-labelledby="settings-look">
			<h3 id="settings-look" class="label">Look and units</h3>
			<Segmented
				legend="Theme"
				name="theme"
				value={theme.choice}
				options={[
					{ value: 'light', label: 'Light' },
					{ value: 'dark', label: 'Dark' },
					{ value: 'system', label: 'Match device' }
				]}
				onchange={(value) => theme.set(value as Theme)}
			/>
			<Segmented
				legend="Default units"
				name="default-units"
				value={preferences.units}
				options={[
					{ value: 'metric', label: 'Metric' },
					{ value: 'us', label: 'US' }
				]}
				onchange={(value) => preferences.setUnits(value as UnitSystem)}
			/>
			<p class="help">Recipes open in these units. You can still switch on any recipe.</p>
		</section>

		<div class="card">
			<PersonalPanel onnavigate={close} onunlock={openOwner} />
		</div>

		<section class="card" aria-labelledby="settings-help">
			<h3 id="settings-help" class="label">Help</h3>
			<a class="link" href={howToHref()} onclick={close}>
				<Icon name="help" size={18} />How to use the cookbook
			</a>
			<a class="link" href={howToHref('questions')} onclick={close}>
				<Icon name="info" size={18} />Questions and answers
			</a>
		</section>

		<details class="card owner" bind:open={ownerOpen}>
			<summary>
				<span>
					<span class="label">For the cookbook's owner</span>
					<span class="help">Edit the cookbook and share recipes with everyone.</span>
				</span>
				<Icon name="chevronDown" size={20} />
			</summary>
			<AdminPanel bind:this={adminPanel} lazy titled={false} onnavigate={close} />
			<a class="link" href={howToHref('sharing')} onclick={close}>
				<Icon name="info" size={18} />What the token, password and AI secret are
			</a>
		</details>
	</div>
</dialog>

<style>
	dialog {
		inset: 0 0 0 auto;
		inline-size: min(26rem, 100vw);
		block-size: 100dvh;
		max-inline-size: none;
		max-block-size: none;
		margin: 0;
		padding: 0;
		border: 0;
		border-inline-start: 1px solid var(--colour-line);
		background: var(--colour-bg);
		color: var(--colour-ink);
		box-shadow: var(--shadow-float);
	}

	dialog[open] {
		animation: slide-in var(--duration-panel) var(--ease-out);
	}

	dialog::backdrop {
		background: var(--colour-scrim);
	}

	.head {
		position: sticky;
		inset-block-start: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: max(var(--space-3), env(safe-area-inset-top, 0px)) var(--space-4) var(--space-3)
			var(--space-5);
		border-block-end: 1px solid var(--colour-line);
		background: var(--colour-surface);
	}

	.close {
		display: grid;
		place-items: center;
		inline-size: var(--target);
		block-size: var(--target);
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		background: transparent;
		color: var(--colour-primary);
	}

	.close:hover {
		background: var(--colour-tint);
	}

	.body {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-4) max(var(--space-5), env(safe-area-inset-bottom, 0px));
	}

	.card {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	.card > .label,
	summary .label {
		color: var(--colour-primary);
		font-family: var(--font-display);
	}

	.help {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.link {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-2);
		min-block-size: var(--target);
		font-weight: 700;
	}

	.owner:not([open]) {
		gap: 0;
	}

	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-block-size: var(--target);
		color: var(--colour-primary);
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary > span {
		display: grid;
		gap: var(--space-1);
	}

	summary :global(svg) {
		flex: none;
		transition: transform var(--duration-micro) var(--ease-out);
	}

	.owner[open] summary :global(svg) {
		transform: rotate(180deg);
	}

	/* A phone gets the whole screen, so the panel reads as a page of its own. */
	@media (max-width: 30rem) {
		dialog {
			border: 0;
		}

		.body {
			padding-inline: var(--gutter);
		}
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}
	}
</style>
