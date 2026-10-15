<script lang="ts">
	import { preferences } from '$lib/stores/preferences.svelte';
	import { theme, type Theme } from '$lib/stores/theme.svelte';
	import type { UnitSystem } from '$lib/types/recipe';
	import AdminPanel from './admin/AdminPanel.svelte';
	import Icon from './Icon.svelte';
	import PersonalPanel from './PersonalPanel.svelte';
	import Segmented from './Segmented.svelte';

	let dialog: HTMLDialogElement;
	let adminPanel: AdminPanel;

	export function show() {
		dialog.showModal();
		adminPanel.check();
	}
</script>

<!-- Escape and the close button already work; a click on the backdrop is a convenience for the pointer. -->
<dialog
	bind:this={dialog}
	aria-labelledby="settings-title"
	onclick={(event) => event.target === dialog && dialog.close()}
>
	<div class="panel">
		<div class="head">
			<h2 id="settings-title">Settings</h2>
			<button
				type="button"
				class="close"
				aria-label="Close settings"
				onclick={() => dialog.close()}
			>
				<Icon name="x" />
			</button>
		</div>

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

		<div class="group">
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
			<p class="help">Recipes open in these units. A shared link can still choose its own.</p>
		</div>

		<PersonalPanel onnavigate={() => dialog.close()} onunlock={() => adminPanel.reveal()} />

		<AdminPanel bind:this={adminPanel} lazy onnavigate={() => dialog.close()} />
	</div>
</dialog>

<style>
	dialog {
		inset: 0 0 0 auto;
		inline-size: min(24rem, 100vw);
		block-size: 100dvh;
		max-block-size: none;
		margin: 0;
		padding: 0;
		border: 0;
		border-inline-start: 1px solid var(--colour-line);
		background: var(--colour-surface);
		color: var(--colour-ink);
		box-shadow: var(--shadow-float);
	}

	dialog[open] {
		animation: slide-in var(--duration-panel) var(--ease-out);
	}

	dialog::backdrop {
		background: var(--colour-scrim);
	}

	.panel {
		display: grid;
		align-content: start;
		gap: var(--space-5);
		padding: max(var(--space-5), env(safe-area-inset-top, 0px)) var(--space-5)
			max(var(--space-5), env(safe-area-inset-bottom, 0px));
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
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

	.group {
		display: grid;
		gap: var(--space-2);
	}

	.help {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}
	}
</style>
