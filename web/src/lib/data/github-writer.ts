import { buildState, GitHubClient, type FileChange, type RepoRef } from '$lib/admin/github';
import type { Recipe, Section } from '$lib/types/recipe';
import { renderRecipe, renderSection } from './canonical';
import type { BuildStatus, RecipeWriter, SaveResult } from './writer';

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

	constructor(token: string, ref: RepoRef, fetcher?: typeof fetch) {
		this.#client = new GitHubClient(token, fetcher);
		this.#ref = ref;
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
		const verb = extras.isNew ? 'add' : 'update';
		const commit = await this.#client.commit(
			this.#ref,
			changes,
			`content(recipes): ${verb} ${recipe.title}`
		);
		this.#staged.clear();
		return { id, commit };
	}

	async remove(id: string, extras: { title: string; image?: string }): Promise<SaveResult> {
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
