import { SvelteSet } from 'svelte/reactivity';
import { checkRecipe, isCoreLoaded } from '$lib/core';
import { allRecipes } from '$lib/data/tree';
import type {
	CheckResult,
	Recipe,
	RecipeData,
	SectionNode,
	SiteIndex
} from '$lib/types/recipe';
import {
	emptyForm,
	formFromRecipe,
	recipeFromForm,
	uid,
	type FormData,
	type IngredientRow
} from './recipe-form';
import { slugify, suggestKey } from './slug';

export interface Photo {
	blob: Blob;
	url: string;
}

export const fieldId = (path: string): string =>
	`f-${path.replace(/\[(\d+)\]/g, '-$1').replace(/\./g, '-')}`;

const folders = (nodes: SectionNode[]): string[] =>
	nodes.flatMap((node) => [node.path, ...folders(node.sections)]);

/** Gives every row a fresh id, so rows restored from a draft cannot clash with rows added later. */
function reissue(form: FormData): FormData {
	for (const group of form.groups) {
		group.uid = uid();
		for (const row of group.items) row.uid = uid();
	}
	for (const step of form.steps) step.uid = uid();
	for (const tip of form.tips) tip.uid = uid();
	return form;
}

export class EditorState {
	readonly index: SiteIndex;
	readonly editing: boolean;
	readonly originalId: string | undefined;
	readonly original: Recipe | undefined;

	form = $state<FormData>(emptyForm());
	photo = $state<Photo | null>(null);
	coreReady = $state(isCoreLoaded());
	showAll = $state(false);
	readonly touched = new SvelteSet<string>();
	#baseline = '';

	constructor(options: {
		index: SiteIndex;
		id?: string;
		data?: RecipeData;
		section?: string;
	}) {
		this.index = options.index;
		this.editing = options.data !== undefined && options.id !== undefined;
		this.originalId = options.id;
		this.original = options.data?.recipe;
		this.form =
			options.data && options.id
				? formFromRecipe(options.data.recipe, options.id)
				: emptyForm(options.section ?? '');
		this.#baseline = this.#snapshot();
	}

	#snapshot(): string {
		return JSON.stringify($state.snapshot(this.form)) + (this.photo ? 'photo' : '');
	}

	/** The key a draft is stored under. */
	get draftId(): string {
		return this.originalId ?? 'new';
	}

	get dirty(): boolean {
		return this.#snapshot() !== this.#baseline;
	}

	markSaved(): void {
		this.#baseline = this.#snapshot();
	}

	restore(form: FormData): void {
		this.form = reissue(form);
	}

	slug = $derived(this.form.slugTouched ? this.form.slug : slugify(this.form.title));
	id = $derived(this.form.section ? `${this.form.section}/${this.slug}` : this.slug);

	existingIds = $derived(allRecipes(this.index).map((card) => card.id));
	existingFolders = $derived(folders(this.index.sections));

	built = $derived.by(() => {
		const src = this.photo ? `${this.slug}.jpg` : undefined;
		return recipeFromForm(this.form, src ? { src } : undefined);
	});

	results = $derived.by<CheckResult[]>(() => {
		const id = this.id;
		const local: CheckResult[] = this.built.issues.map(({ path, message }) => ({
			id: 'F-NUMBER',
			level: 'error',
			message,
			path,
			recipe: id
		}));
		if (!this.editing && this.existingIds.includes(id)) {
			local.push({
				id: 'F-ID-EXISTS',
				level: 'error',
				message: 'A recipe with this address already exists. Change the address.',
				path: '',
				recipe: id
			});
		}
		for (const added of this.form.newSections) {
			if (!added.title.trim()) {
				local.push({
					id: 'F-SECTION-TITLE',
					level: 'error',
					message: 'Give the new section a name.',
					path: 'section',
					recipe: id
				});
			}
		}
		if (!this.coreReady) return local;
		try {
			const checked = checkRecipe(this.built.recipe, id, {
				knownIds: this.existingIds,
				sectionFolders: [...this.existingFolders, ...this.form.newSections.map((s) => s.path)]
			});
			return [...local, ...checked];
		} catch (error) {
			return [
				...local,
				{
					id: 'F-CHECK',
					level: 'error',
					message: error instanceof Error ? error.message : 'The checklist could not run.',
					path: '',
					recipe: id
				}
			];
		}
	});

	errors = $derived(this.results.filter((r) => r.level === 'error'));
	warnings = $derived(this.results.filter((r) => r.level === 'warning'));
	canSave = $derived(this.coreReady && this.errors.length === 0);

	/** Where a result belongs: file-level results are about the address or the section. */
	pathOf(result: CheckResult): string {
		if (result.path) return result.path;
		return result.id === 'E-SECTION-MISSING' ? 'section' : 'slug';
	}

	touch(path: string): void {
		this.touched.add(path);
	}

	/** The first error at exactly `path`, once the author has been to the field or tried to save. */
	errorFor(path: string): string | undefined {
		if (!this.showAll && !this.touched.has(path)) return undefined;
		return this.errors.find((result) => this.pathOf(result) === path)?.message;
	}

	/** Every ingredient, for the token picker. */
	get ingredientRows(): IngredientRow[] {
		return this.form.groups.flatMap((group) => group.items).filter((row) => row.item.trim());
	}

	get keys(): string[] {
		return this.form.groups.flatMap((g) => g.items.map((row) => row.key)).filter(Boolean);
	}

	/** Gives the row a key if it has none, and returns it. */
	ensureKey(row: IngredientRow): string {
		if (!row.key) row.key = suggestKey(row.item, this.keys);
		return row.key;
	}
}
