<script lang="ts">
	import { exportFile, type ExportFormat } from '$lib/data/local-export';
	import { download } from '$lib/share';
	import { deviceNotice } from '$lib/stores/device-notice.svelte';
	import { personal } from '$lib/stores/personal.svelte';
	import Modal from './admin/Modal.svelte';
	import Icon from './Icon.svelte';

	/** Saves the cook's own recipes as a file, in the format they choose. */
	let modal: Modal | undefined = $state();
	let busy = $state(false);
	let problem = $state('');

	const FORMATS: { value: ExportFormat; label: string; detail: string }[] = [
		{ value: 'txt', label: 'Text', detail: 'Easy to read, print or paste anywhere.' },
		{ value: 'csv', label: 'Spreadsheet (CSV)', detail: 'Opens in Excel or Google Sheets.' },
		{ value: 'json', label: 'JSON', detail: 'Everything, exactly as stored.' }
	];

	export function show() {
		problem = '';
		modal?.show();
	}

	async function save(format: ExportFormat) {
		busy = true;
		try {
			const { blob, name } = await exportFile(personal.list, format);
			download(blob, name);
			deviceNotice.rest();
			modal?.close();
		} catch {
			problem = 'The file could not be made. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:this={modal} title="Export your recipes">
	<p class="lede">Choose a format. The file is saved to your downloads.</p>
	<ul>
		{#each FORMATS as format (format.value)}
			<li>
				<button type="button" disabled={busy} onclick={() => save(format.value)}>
					<Icon name="download" size={18} />
					<span><strong>{format.label}</strong><span class="detail">{format.detail}</span></span>
				</button>
			</li>
		{/each}
	</ul>
	{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
</Modal>

<style>
	.lede,
	.detail {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	ul {
		display: grid;
		gap: var(--space-2);
		margin-block: var(--space-3);
	}

	button {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		inline-size: 100%;
		min-block-size: var(--target);
		padding: var(--space-3);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		color: var(--colour-ink);
		text-align: start;
	}

	button:hover:not(:disabled) {
		border-color: var(--colour-primary);
		background: var(--colour-tint);
	}

	button :global(svg) {
		flex: none;
		color: var(--colour-primary);
	}

	button > span {
		display: grid;
	}

	.problem {
		color: var(--colour-danger);
		font-size: var(--text-s);
		font-weight: 700;
	}
</style>
