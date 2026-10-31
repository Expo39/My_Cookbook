<script lang="ts">
	import '$lib/styles/admin.css';
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { beforeNavigate, goto } from '$app/navigation';
	import { clearDraft, loadDraft, saveDraft, type Draft } from '$lib/admin/draft';
	import { EditorState, fieldId } from '$lib/admin/editor-state.svelte';
	import { summarise } from '$lib/admin/checklist';
	import { admin } from '$lib/admin/session.svelte';
	import { uid, type FormData } from '$lib/admin/recipe-form';
	import { moveItem, removeItem } from '$lib/admin/lists';
	import { createAiClient } from '$lib/ai';
	import AdminPanel from '$lib/components/admin/AdminPanel.svelte';
	import AiImport from '$lib/components/admin/AiImport.svelte';
	import ChecklistPanel from '$lib/components/admin/ChecklistPanel.svelte';
	import DeleteDialog from '$lib/components/admin/DeleteDialog.svelte';
	import Field from '$lib/components/admin/Field.svelte';
	import FieldSet from '$lib/components/admin/FieldSet.svelte';
	import IngredientsEditor from '$lib/components/admin/IngredientsEditor.svelte';
	import MethodEditor from '$lib/components/admin/MethodEditor.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import PhotoField from '$lib/components/admin/PhotoField.svelte';
	import RecipePreview from '$lib/components/admin/RecipePreview.svelte';
	import RelatedPicker from '$lib/components/admin/RelatedPicker.svelte';
	import RowList from '$lib/components/admin/RowList.svelte';
	import SectionPicker from '$lib/components/admin/SectionPicker.svelte';
	import TagsField from '$lib/components/admin/TagsField.svelte';
	import TextField from '$lib/components/admin/TextField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { loadCore } from '$lib/core';
	import { createSource, createWriter, RecipeNotFoundError } from '$lib/data';
	import { LocalWriter } from '$lib/data/local-writer';
	import { deviceNotice } from '$lib/stores/device-notice.svelte';
	import { personal } from '$lib/stores/personal.svelte';
	import type { BuildStatus, RecipeWriter, SaveResult } from '$lib/data/writer';
	import { WriteError } from '$lib/data/writer';
	import { editHref, homeHref, mineHref, pageHref } from '$lib/links';
	import { chrome } from '$lib/stores/chrome.svelte';
	import { siteTitle } from '$lib/title';

	let { data } = $props();

	type Phase = 'loading' | 'locked' | 'missing' | 'ready';
	type Pane = 'edit' | 'checks' | 'preview';

	const ai = createAiClient();
	const POLL_MILLISECONDS = 5000;
	const POLL_LIMIT = 180;

	let phase = $state<Phase>('loading');
	let mounted = $state(false);
	/** Saving to this browser: anyone's own recipes. Without it, saves go to GitHub with the token. */
	let local = $state(false);
	const viewHref = (id: string) => (local ? mineHref(id) : pageHref(id));
	let ed = $state.raw<EditorState>();
	let writer: RecipeWriter | undefined;
	let pane = $state<Pane>('edit');
	/** The address follows the title; it is folded away until someone wants to change it. */
	let addressOpen = $state(false);
	let draft = $state<Draft<FormData> | null>(null);
	let saving = $state(false);
	let problem = $state('');
	let outcome = $state<{ kind: 'saved' | 'moved' | 'deleted'; id: string; title: string } | null>(
		null
	);
	let status = $state<BuildStatus | null>(null);
	let stopped = false;
	let leaving = false;
	let destination: URL | null = null;
	let aiImport: AiImport | undefined = $state();
	let deleteDialog: DeleteDialog | undefined = $state();
	let leaveDialog: Modal | undefined = $state();

	const panes: { value: Pane; label: string }[] = $derived([
		{ value: 'edit', label: 'Edit' },
		{ value: 'checks', label: ed?.errors.length ? `To do (${ed.errors.length})` : 'To do' },
		{ value: 'preview', label: 'Preview' }
	]);

	onMount(() => {
		void admin.restore();
		deviceNotice.load();
		void personal.load().then(() => (mounted = true));
		// The save bar sits where the back-to-top button would, so the button moves above it.
		chrome.hasActionBar = true;
		return () => (chrome.hasActionBar = false);
	});

	onDestroy(() => (stopped = true));

	$effect(() => {
		if (ed?.errorFor('slug') || ed?.moving) addressOpen = true;
	});

	/*
	 * Anyone can add a recipe, and change or delete the ones they added on this device. The cookbook's
	 * own recipes stay as they are unless editing is unlocked with the GitHub token.
	 */
	$effect(() => {
		if (!mounted) return;
		const id = new SvelteURLSearchParams(location.search).get('id');
		const mine = !!id && personal.editable(id);
		const onDevice = mine || (!id && !admin.unlocked);
		if (onDevice || admin.unlocked) untrack(() => open(onDevice));
		else {
			ed = undefined;
			phase = 'locked';
		}
	});

	async function open(onDevice: boolean) {
		if (ed) return;
		const params = new SvelteURLSearchParams(location.search);
		const id = params.get('id');
		let state: EditorState;
		local = onDevice;
		try {
			writer = onDevice ? new LocalWriter(createSource()) : createWriter(admin.token);
			state = id
				? new EditorState({
						index: data.index,
						id,
						recipe: await writer.read(id),
						plainSteps: onDevice
					})
				: new EditorState({
						index: data.index,
						section: params.get('section') ?? '',
						plainSteps: onDevice
					});
		} catch (error) {
			if (error instanceof RecipeNotFoundError) phase = 'missing';
			else problem = 'The recipe could not be loaded. Reload the page to try again.';
			return;
		}
		ed = state;
		phase = 'ready';
		draft = loadDraft<FormData>(state.draftId) ?? null;
		loadCore()
			.then(() => (state.coreReady = true))
			.catch(() => (problem = 'The checklist could not load, so saving is switched off.'));
	}

	// The draft is kept on this device a moment after each change.
	$effect(() => {
		if (!ed?.dirty) return;
		const key = ed.draftId;
		const form = $state.snapshot(ed.form);
		const timer = setTimeout(() => saveDraft(key, form), 500);
		return () => clearTimeout(timer);
	});

	beforeNavigate(({ cancel, to, type }) => {
		if (leaving || !ed?.dirty) return;
		cancel();
		if (type !== 'leave' && to) {
			destination = to.url;
			leaveDialog?.show();
		}
	});

	async function leave() {
		leaving = true;
		leaveDialog?.close();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- SvelteKit already resolved this address
		if (destination) await goto(destination);
	}

	function restoreDraft() {
		if (ed && draft) ed.restore(draft.form);
		draft = null;
	}

	function discardDraft() {
		if (ed) clearDraft(ed.draftId);
		draft = null;
	}

	/** The form control a result is about; a path with no control of its own falls back to its parent's. */
	function fieldFor(path: string): HTMLElement | null {
		// The address follows the title, and a recipe on this device does not show it at all.
		let current = path === 'slug' && !document.getElementById(fieldId('slug')) ? 'title' : path;
		while (current) {
			const id = fieldId(current);
			const target = document.getElementById(id) ?? document.querySelector(`[id^="${id}-"]`);
			if (target instanceof HTMLElement) return target;
			const parent = current.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
			if (parent === current) return null;
			current = parent;
		}
		return null;
	}

	function reveal(target: HTMLElement | null | undefined) {
		const folded = target?.closest('details');
		if (folded) folded.open = true;
		target?.scrollIntoView({ block: 'center' });
		target?.focus();
	}

	async function jump(paths: string | string[]) {
		pane = 'edit';
		await tick();
		const fields = [paths].flat().flatMap((path) => fieldFor(path) ?? []);
		fields.sort((a, b) =>
			a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
		);
		reveal(fields[0]);
	}

	async function watch(writer: RecipeWriter, result: SaveResult) {
		status = { state: 'building' };
		for (let attempt = 0; attempt < POLL_LIMIT && !stopped; attempt++) {
			try {
				status = await writer.status(result);
			} catch {
				status = null;
			}
			if (status && status.state !== 'building') return;
			await new Promise((resolve) => setTimeout(resolve, POLL_MILLISECONDS));
		}
	}

	function failure(error: unknown): string {
		if (error instanceof WriteError && error.results.length) {
			return `${error.message} ${error.results.map((result) => result.message).join(' ')}`;
		}
		return error instanceof Error ? error.message : 'Something went wrong. Nothing was saved.';
	}

	async function save() {
		if (!ed) return;
		const editor = ed;
		editor.showAll = true;
		if (editor.errors.length || !editor.canSave) {
			void jump(editor.errors.map((result) => editor.pathOf(result)));
			return;
		}
		saving = true;
		problem = '';
		outcome = null;
		try {
			const target = (writer ??= createWriter(admin.token));
			for (const added of ed.neededSections) {
				await target.createSection(added.path, { title: added.title });
			}
			let recipe = ed.built.recipe;
			if (ed.photo && !ed.moving) {
				const { src } = await target.uploadImage(ed.id, ed.photo.blob);
				recipe = { ...recipe, image: { src, alt: ed.form.imageAlt.trim() } };
			}
			const moved = ed.moving && ed.originalId !== undefined;
			const result = moved
				? await target.move(ed.originalId as string, ed.id, recipe, {
						previousImage: ed.original?.image?.src,
						photo: ed.photo?.blob
					})
				: await target.save(ed.id, recipe, {
						isNew: !ed.editing,
						previousImage: ed.original?.image?.src
					});
			clearDraft(ed.draftId);
			ed.markSaved();
			outcome = { kind: moved ? 'moved' : 'saved', id: result.id, title: recipe.title };
			chrome.notify(local ? 'Saved on this device' : 'Saved. It goes live once the build finishes');
			if (!local) void watch(target, result);
			if (moved) await reopen(target, result.id);
		} catch (error) {
			problem = failure(error);
		} finally {
			saving = false;
		}
	}

	/** Continues editing the moved recipe at its new address. */
	async function reopen(target: RecipeWriter, id: string) {
		try {
			const state = new EditorState({ index: data.index, id, recipe: await target.read(id) });
			state.coreReady = true;
			ed = state;
			history.replaceState(history.state, '', editHref({ id }));
		} catch {
			problem = 'The recipe was moved, but it could not be opened again. Reload the page.';
		}
	}

	async function remove() {
		if (!ed?.originalId || !ed.original) return;
		const target = (writer ??= createWriter(admin.token));
		const result = await target.remove(ed.originalId, {
			title: ed.original.title,
			image: ed.original.image?.src
		});
		clearDraft(ed.draftId);
		ed.markSaved();
		outcome = { kind: 'deleted', id: ed.originalId, title: ed.original.title };
		if (!local) void watch(target, result);
	}
</script>

<svelte:head>
	<title>{ed?.editing ? 'Edit recipe' : 'New recipe'} | {siteTitle}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onbeforeunload={(event) => ed?.dirty && event.preventDefault()} />

{#if phase === 'loading'}
	<p class="page-note" role="status">Loading the editor...</p>
{:else if phase === 'locked'}
	<section class="locked">
		<h1>This recipe is part of the cookbook</h1>
		<p class="help">
			Only the cookbook's owner can change it, by unlocking editing with the GitHub token. You can
			add recipes of your own at any time.
		</p>
		<a class="btn primary" href={editHref()} data-sveltekit-reload>
			<Icon name="plus" size={18} />Add your own recipe
		</a>
		<AdminPanel />
	</section>
{:else if phase === 'missing'}
	<section class="locked">
		<h1>That recipe is not in the cookbook</h1>
		<p class="help">It may have been deleted or renamed.</p>
		<a class="btn" href={homeHref()}>Back to the cookbook</a>
	</section>
{:else if ed}
	{@const editor = ed}

	{#snippet localName()}
		<TextField
			id={fieldId('titleLocal')}
			label="Local name"
			bind:value={editor.form.titleLocal}
			optional
			hint="The Maltese or Italian name, shown under the title."
		/>
	{/snippet}

	{#snippet nouns()}
		<TextField
			id="noun-one"
			label="One serving is called"
			bind:value={editor.form.nounOne}
			optional
			hint="Such as 'person'."
		/>
		<TextField
			id="noun-other"
			label="Several are called"
			bind:value={editor.form.nounOther}
			optional
			hint="Such as 'people' or 'boards'."
		/>
	{/snippet}

	{#snippet difficultyAndTags()}
		<Field id={fieldId('difficulty')} label="Difficulty" optional>
			<select id={fieldId('difficulty')} class="control" bind:value={editor.form.difficulty}>
				<option value="">Not stated</option>
				<option value="easy">Easy</option>
				<option value="medium">Medium</option>
				<option value="hard">Hard</option>
			</select>
		</Field>
		<TagsField ed={editor} />
	{/snippet}

	{#snippet address()}
		<details class="address" bind:open={addressOpen}>
			<summary>
				<span>Web address <code>/{editor.id}</code></span>
				<span class="change">Change</span>
			</summary>
			<TextField
				id={fieldId('slug')}
				label="Web address"
				bind:value={
					() => editor.slug,
					(value) => {
						editor.form.slug = value;
						editor.form.slugTouched = true;
					}
				}
				hint={editor.editing
					? `Changing this moves the recipe. It is at /${editor.originalId} now.`
					: `Follows the title until you change it: /${editor.id}`}
				error={editor.errorFor('slug')}
				onblur={() => editor.touch('slug')}
			/>
		</details>
		{#if editor.moving}
			<p class="notice" role="status">
				<span>
					<strong>This moves the recipe.</strong> The photo and the links from other recipes move with
					it.
				</span>
				<span>From <code>/{editor.originalId}</code></span>
				<span>To <code>/{editor.id}</code></span>
			</p>
		{/if}
	{/snippet}

	{#snippet tipsAndRelated()}
		<FieldSet legend="Tips" id={fieldId('tips')}>
			<p class="help">Shown as the "Chef's tip" beside the method.</p>
			<RowList
				items={editor.form.tips}
				noun="tip"
				onmove={(from, to) => moveItem(editor.form.tips, from, to)}
				onremove={(index) => removeItem(editor.form.tips, index)}
			>
				{#snippet row(tip, index)}
					<TextField
						id={fieldId(`tips[${index}]`)}
						label="Tip {index + 1}"
						rows={3}
						bind:value={tip.text}
					/>
				{/snippet}
			</RowList>
			<button
				type="button"
				class="btn add"
				onclick={() => editor.form.tips.push({ uid: uid(), text: '' })}
			>
				<Icon name="plus" size={18} />Add a tip
			</button>
		</FieldSet>
		<RelatedPicker ed={editor} />
	{/snippet}
	<div class="editor">
		<header class="top">
			<div>
				<h1>{editor.editing ? 'Edit recipe' : 'New recipe'}</h1>
				{#if local}
					<p class="intro">
						A title, the ingredients and the method are all a recipe needs. Write it the way you
						would tell a friend; the rest is optional.
					</p>
					{#if deviceNotice.read === null}
						<div class="first" role="note">
							<p>
								<strong>Your recipes are saved only in this browser, on this device.</strong> If you clear
								your browsing data or remove the browser, they are deleted for good. Export them from
								Settings now and then to keep a copy.
							</p>
							<button type="button" class="btn primary" onclick={() => deviceNotice.acknowledge()}>
								Got it
							</button>
						</div>
					{:else}
						<p class="where">
							<Icon name="device" size={16} />Saved only in this browser on this device.
						</p>
					{/if}
				{/if}
			</div>
			<div class="top-actions">
				{#if editor.editing}
					<a class="btn" href={viewHref(editor.originalId ?? '')}>View the recipe</a>
				{/if}
				{#if ai && !editor.editing && !local}
					<button type="button" class="btn" onclick={() => aiImport?.show()}>
						<Icon name="hat" size={18} />Import from text
					</button>
				{/if}
			</div>
		</header>

		{#if draft}
			<div class="notice" role="status">
				<p>
					A draft from {new Date(draft.savedAt).toLocaleString('en-GB')} is saved on this device.
				</p>
				<div class="notice-actions">
					<button type="button" class="btn primary" onclick={restoreDraft}>Restore the draft</button
					>
					<button type="button" class="btn" onclick={discardDraft}>Discard it</button>
				</div>
			</div>
		{/if}

		{#if outcome}
			<div class="notice outcome" role="status">
				<p>
					{#if outcome.kind === 'saved'}
						<strong>{outcome.title}</strong> was saved.
					{:else if outcome.kind === 'moved'}
						<strong>{outcome.title}</strong> was moved to <code>/{outcome.id}</code>.
					{:else}
						<strong>{outcome.title}</strong> was deleted.
					{/if}
					{#if local}
						<Icon name="device" size={18} />It is on this device, ready to cook from.
					{:else if status?.state === 'building'}
						<Icon name="clock" size={18} />Building... the site is live in about a minute.
					{:else if status?.state === 'live'}
						<Icon name="checkCircle" size={18} />Live.
					{:else if status?.state === 'superseded'}
						<Icon name="clock" size={18} />A later save replaced this build. The change goes live
						with that one.
					{:else if status?.state === 'failed'}
						<Icon name="xCircle" size={18} />The build failed.
						<a href={status.url} rel="external noreferrer">See what went wrong</a>
					{:else}
						The build status is not available just now.
					{/if}
				</p>
				<div class="notice-actions">
					{#if outcome.kind !== 'deleted' && (local || status?.state === 'live')}
						<a class="btn" href={viewHref(outcome.id)}>View the recipe</a>
					{/if}
					<a class="btn" href={editHref()} data-sveltekit-reload>New recipe</a>
					<a class="btn" href={homeHref()}>Back to the cookbook</a>
				</div>
			</div>
		{/if}

		<div class="tabs">
			<Segmented
				legend="Show"
				name="pane"
				hideLegend
				value={pane}
				options={panes}
				onchange={(value) => (pane = value as Pane)}
			/>
		</div>

		<div class="columns">
			<form
				class="form"
				class:inactive={pane !== 'edit'}
				onsubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<FieldSet legend="Basics">
					<TextField
						id={fieldId('title')}
						label="Title"
						bind:value={editor.form.title}
						error={editor.errorFor('title')}
						onblur={() => editor.touch('title')}
					/>
					{#if !local}{@render localName()}{/if}
					<TextField
						id={fieldId('summary')}
						label="Summary"
						rows={3}
						bind:value={editor.form.summary}
						counter={200}
						hint="One or two sentences for cards and the top of the page."
						error={editor.errorFor('summary')}
						onblur={() => editor.touch('summary')}
					/>
					<div class="row">
						<TextField
							id={fieldId('servings')}
							label="Servings"
							bind:value={editor.form.servings}
							inputmode="numeric"
							numeric
							hint="What the amounts are written for."
							error={editor.errorFor('servings')}
							onblur={() => editor.touch('servings')}
						/>
						{#if !local}{@render nouns()}{/if}
					</div>
					<div class="row">
						<TextField
							id={fieldId('times.prep')}
							label="Prep (minutes)"
							bind:value={editor.form.prep}
							inputmode="numeric"
							numeric
							optional
							error={editor.errorFor('times.prep')}
						/>
						<TextField
							id={fieldId('times.cook')}
							label="Cook (minutes)"
							bind:value={editor.form.cook}
							inputmode="numeric"
							numeric
							optional
							error={editor.errorFor('times.cook')}
						/>
						<TextField
							id={fieldId('times.rest')}
							label="Rest (minutes)"
							bind:value={editor.form.rest}
							inputmode="numeric"
							numeric
							optional
							error={editor.errorFor('times.rest')}
						/>
					</div>
					{#if !local}{@render difficultyAndTags()}{/if}
				</FieldSet>

				<FieldSet legend="Where it lives">
					<SectionPicker ed={editor} {local} />
					{#if !local}{@render address()}{/if}
				</FieldSet>

				{#if !local}<PhotoField ed={editor} />{/if}
				<IngredientsEditor ed={editor} />
				<MethodEditor ed={editor} />

				{#if local}
					<details class="more">
						<summary>More details (optional)</summary>
						<div class="more-fields">
							{@render localName()}
							<div class="row">{@render nouns()}</div>
							{@render difficultyAndTags()}
							{@render tipsAndRelated()}
						</div>
					</details>
				{:else}
					{@render tipsAndRelated()}
				{/if}

				{#if editor.form.variants.length}
					<FieldSet legend="Variants">
						<p class="help">
							This recipe has {editor.form.variants.length}
							{editor.form.variants.length === 1 ? 'variant' : 'variants'}, such as a choice between
							two ingredients. They are kept exactly as they are. To change them, edit the recipe's
							JSON file.
						</p>
					</FieldSet>
				{/if}

				{#if editor.editing}
					<FieldSet legend="Delete">
						<p class="help">
							Removes the recipe and its photo. Recipes that still link to it must be updated first.
						</p>
						<button type="button" class="btn danger delete" onclick={() => deleteDialog?.show()}>
							<Icon name="trash" size={18} />Delete this recipe
						</button>
					</FieldSet>
				{/if}

				<div class="bar">
					<p class="bar-summary" role="status">
						{editor.coreReady ? summarise(editor.errors.length) : 'Getting ready...'}
					</p>
					<button class="btn primary" disabled={saving || !editor.coreReady}>
						<Icon name="check" size={18} />{saving
							? 'Saving...'
							: editor.moving
								? 'Move and save'
								: 'Save recipe'}
					</button>
				</div>
				{#if problem}
					<p class="error" role="alert"><Icon name="alert" size={16} />{problem}</p>
				{/if}
			</form>

			<div class="aside">
				<div class:inactive={pane !== 'checks'}>
					<ChecklistPanel ed={editor} onjump={jump} />
				</div>
				<div class:inactive={pane !== 'preview'}>
					<RecipePreview ed={editor} />
				</div>
			</div>
		</div>
	</div>

	{#if ai && !editor.editing && !local}
		<AiImport bind:this={aiImport} ed={editor} client={ai} onimported={() => (pane = 'edit')} />
	{/if}
	{#if editor.editing}
		<DeleteDialog
			bind:this={deleteDialog}
			ed={editor}
			ondelete={remove}
			readAll={() => (writer ??= createWriter(admin.token)).readAll()}
		/>
	{/if}
	<Modal bind:this={leaveDialog} title="Leave without saving?">
		<p>
			The changes are kept as a draft on this device, so they will be offered again when you return.
		</p>
		<div class="notice-actions">
			<button type="button" class="btn primary" onclick={() => leaveDialog?.close()}>
				Keep editing
			</button>
			<button type="button" class="btn" onclick={leave}>Leave</button>
		</div>
	</Modal>
{/if}

<style>
	.editor,
	.form,
	.locked {
		display: grid;
		gap: var(--space-5);
	}

	.locked {
		max-inline-size: 28rem;
		margin-inline: auto;
	}

	.page-note {
		min-block-size: 70dvh;
		color: var(--colour-muted);
	}

	.intro {
		max-inline-size: 60ch;
	}

	.more {
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	.more summary {
		padding: var(--space-4);
		color: var(--colour-primary);
		font-family: var(--font-display);
		font-size: var(--text-l);
		font-weight: 800;
		cursor: pointer;
	}

	.address summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-block-size: var(--target);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.address[open] summary {
		margin-block-end: var(--space-2);
	}

	.change {
		color: var(--colour-primary);
		font-weight: 700;
	}

	.address[open] .change {
		display: none;
	}

	.more-fields {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--space-4) var(--space-4);
	}

	.first {
		display: grid;
		max-inline-size: 44rem;
		gap: var(--space-3);
		justify-items: start;
		margin-block-start: var(--space-2);
		padding: var(--space-4);
		border-inline-start: 4px solid var(--colour-accent);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
	}

	.where {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.top-actions,
	.notice-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.notice {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-inline-start: 4px solid var(--colour-primary);
		border-radius: var(--radius-s);
		background: var(--colour-surface);
	}

	.outcome :global(svg) {
		vertical-align: -0.2em;
	}

	.row {
		display: grid;
		gap: var(--space-3);
	}

	.add {
		justify-self: start;
	}

	.delete {
		justify-self: start;
	}

	.columns,
	.aside {
		display: grid;
		gap: var(--space-5);
		align-content: start;
	}

	.bar {
		position: sticky;
		inset-block-end: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		padding-block-end: max(var(--space-3), env(safe-area-inset-bottom, 0px));
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
		box-shadow: var(--shadow-float);
	}

	.bar-summary {
		font-weight: 700;
	}

	.bar .btn {
		flex: none;
		white-space: nowrap;
	}

	@media (max-width: 63.99rem) {
		.inactive {
			display: none;
		}
	}

	@media (min-width: 40rem) {
		.row {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 64rem) {
		.tabs {
			display: none;
		}

		.columns {
			grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
			align-items: start;
		}

		.aside {
			position: sticky;
			inset-block-start: var(--space-4);
			max-block-size: calc(100dvh - 2 * var(--space-4));
			overflow-y: auto;
		}
	}
</style>
