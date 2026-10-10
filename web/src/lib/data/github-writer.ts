import { buildState, GitHubClient, type FileChange, type RepoRef } from '$lib/admin/github';
import type { Recipe, Section } from '$lib/types/recipe';
import { renderRecipe, renderSection } from './canonical';
import { RecipeNotFoundError } from './source';
import { WriteError, type BuildStatus, type RecipeWriter, type SaveResult } from './writer';

const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

const folderOf = (id: string) => id.slice(0, id.lastIndexOf('/'));
const slugOf = (id: string) => id.slice(id.lastIndexOf('/') + 1);

/**
 * Commits through the Git Data API, so a recipe, its photo and any new section land in a single
 * commit. Sections and the photo are staged and written by the next `save`.
 */
export class GitHubWriter implements RecipeWriter {
	readonly #client: GitHubClient;
	readonly #ref: RepoRef;
	#staged = new Map<string, FileChange>();
	/** The blob sha each recipe had when it was read, which a later write must still find. */
	#based = new Map<string, string>();

	constructor(token: string, ref: RepoRef, fetcher?: typeof fetch) {
		this.#client = new GitHubClient(token, fetcher);
		this.#ref = ref;
	}

	async read(id: string): Promise<Recipe> {
		const file = await this.#client.file(this.#ref, `recipes/${id}.json`);
		if (!file) throw new RecipeNotFoundError(id);
		this.#based.set(id, file.sha);
		return JSON.parse(file.text) as Recipe;
	}

	/** Refuses to overwrite a recipe that changed after it was read, or one that appeared at a new address. */
	async #expectUnchanged(id: string, expected: string | undefined): Promise<void> {
		const current = await this.#client.file(this.#ref, `recipes/${id}.json`);
		if (current?.sha === expected) return;
		throw new WriteError(
			expected
				? 'This recipe was changed on GitHub after you opened it. Nothing was saved. Reload the page and make the change again.'
				: 'A recipe with this address already exists on GitHub. Nothing was saved. Change the address.',
			'conflict'
		);
	}

	async createSection(path: string, section: Section): Promise<void> {
		this.#staged.set(`recipes/${path}/_section.json`, {
			path: `recipes/${path}/_section.json`,
			content: renderSection({
				title: section.title,
				order: section.order ?? undefined,
				summary: section.summary ?? undefined
			})
		});
	}

	async uploadImage(id: string, file: Blob): Promise<{ src: string }> {
		const src = `${slugOf(id)}.${EXTENSIONS[file.type] ?? 'jpg'}`;
		const path = `recipes/${folderOf(id)}/${src}`;
		this.#staged.set(path, { path, content: new Uint8Array(await file.arrayBuffer()) });
		return { src };
	}

	async save(
		id: string,
		recipe: Recipe,
		extras: { isNew: boolean; previousImage?: string }
	): Promise<SaveResult> {
		const path = `recipes/${id}.json`;
		const changes: FileChange[] = [
			...this.#staged.values(),
			{ path, content: renderRecipe(recipe) }
		];
		if (extras.previousImage && extras.previousImage !== recipe.image?.src) {
			changes.push({ path: `recipes/${folderOf(id)}/${extras.previousImage}`, content: null });
		}
		await this.#expectUnchanged(id, this.#based.get(id));
		const verb = extras.isNew ? 'add' : 'update';
		const commit = await this.#client.commit(
			this.#ref,
			changes,
			`content(recipes): ${verb} ${recipe.title}`
		);
		this.#staged.clear();
		this.#based.set(id, (await this.#client.file(this.#ref, path))?.sha ?? '');
		return { id, commit };
	}

	async remove(id: string, extras: { title: string; image?: string }): Promise<SaveResult> {
		const known = this.#based.get(id);
		if (known) await this.#expectUnchanged(id, known);
		const changes: FileChange[] = [{ path: `recipes/${id}.json`, content: null }];
		if (extras.image) {
			changes.push({ path: `recipes/${folderOf(id)}/${extras.image}`, content: null });
		}
		const commit = await this.#client.commit(
			this.#ref,
			changes,
			`content(recipes): remove ${extras.title}`
		);
		return { id, commit };
	}

	async status(result: SaveResult): Promise<BuildStatus> {
		if (!result.commit) return { state: 'live' };
		return buildState(await this.#client.runs(this.#ref, result.commit));
	}
}
