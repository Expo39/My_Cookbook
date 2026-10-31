import { buildState, GitHubClient, type FileChange, type RepoRef } from '$lib/admin/github';
import type { Recipe, Section } from '$lib/types/recipe';
import { renderRecipe, renderSection } from './canonical';
import { recipesLinkingTo, relink } from '$lib/admin/removal';
import { RecipeNotFoundError } from './source';
import { storedRecipes, type Site, type StoredRecipe } from './stored';
import {
	CHANGED_MESSAGE,
	WriteError,
	type BuildStatus,
	type RecipeWriter,
	type SaveResult
} from './writer';

const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** A file the editor may write: a recipe, a section or a photo, inside `recipes/` and nowhere else. */
const WRITABLE = new RegExp(
	`^recipes/(?:${SLUG}/)*(?:${SLUG}\\.json|_section\\.json|${SLUG}\\.(?:jpg|png|webp))$`
);

/**
 * Refuses a change outside the recipes before anything reaches GitHub. The editor only makes
 * well-formed paths, but the token can write anywhere, so the writer checks for itself.
 */
function checkPaths(changes: FileChange[]): FileChange[] {
	const stray = changes.find((change) => !WRITABLE.test(change.path));
	if (stray)
		throw new WriteError(`Nothing was saved: "${stray.path}" is not a recipe file.`, 'path');
	return changes;
}

const folderOf = (id: string) => id.slice(0, id.lastIndexOf('/'));
const slugOf = (id: string) => id.slice(id.lastIndexOf('/') + 1);
const extensionOf = (file: string) => file.slice(file.lastIndexOf('.'));

const noSite = {
	getIndex: async () => ({ sections: [] }),
	getRecipe: () => Promise.reject(new Error('The deployed site is not available.'))
};

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

	readonly #site: Site | undefined;

	constructor(token: string, ref: RepoRef, fetcher?: typeof fetch, site?: Site) {
		this.#client = new GitHubClient(token, fetcher);
		this.#ref = ref;
		this.#site = site;
	}

	readAll(): Promise<StoredRecipe[]> {
		return storedRecipes(this.#client, this.#ref, this.#site ?? { source: noSite, built: '' });
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
				? CHANGED_MESSAGE
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
			checkPaths(changes),
			`content(recipes): ${verb} ${recipe.title}`
		);
		this.#staged.clear();
		this.#based.set(id, (await this.#client.file(this.#ref, path))?.sha ?? '');
		return { id, commit };
	}

	async move(
		from: string,
		to: string,
		recipe: Recipe,
		extras: { previousImage?: string; photo?: Blob }
	): Promise<SaveResult> {
		await this.#expectUnchanged(from, this.#based.get(from));
		await this.#expectUnchanged(to, undefined);

		const oldFolder = `recipes/${folderOf(from)}`;
		const newFolder = `recipes/${folderOf(to)}`;
		const changes: FileChange[] = [];
		let moved = recipe;
		if (extras.photo) {
			const { src } = await this.uploadImage(to, extras.photo);
			moved = { ...recipe, image: { src, alt: recipe.image?.alt ?? '' } };
		} else if (recipe.image && extras.previousImage) {
			const src = `${slugOf(to)}${extensionOf(extras.previousImage)}`;
			const photo = await this.#client.file(this.#ref, `${oldFolder}/${extras.previousImage}`);
			if (!photo) {
				throw new WriteError(
					'The photo could not be found on GitHub. Nothing was moved.',
					'failed'
				);
			}
			changes.push({ path: `${newFolder}/${src}`, content: { sha: photo.sha } });
			moved = { ...recipe, image: { ...recipe.image, src } };
		}
		if (extras.previousImage) {
			changes.push({ path: `${oldFolder}/${extras.previousImage}`, content: null });
		}

		const linkers = recipesLinkingTo(from, await this.readAll());
		for (const { id, recipe: linker } of linkers) {
			changes.push({
				path: `recipes/${id}.json`,
				content: renderRecipe(relink(linker, from, to))
			});
		}
		changes.push(
			{ path: `recipes/${to}.json`, content: renderRecipe(moved) },
			{ path: `recipes/${from}.json`, content: null }
		);

		const commit = await this.#client.commit(
			this.#ref,
			checkPaths([...this.#staged.values(), ...changes]),
			`content(recipes): move ${recipe.title}`
		);
		this.#staged.clear();
		this.#based.delete(from);
		this.#based.set(to, (await this.#client.file(this.#ref, `recipes/${to}.json`))?.sha ?? '');
		return { id: to, commit };
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
			checkPaths(changes),
			`content(recipes): remove ${extras.title}`
		);
		return { id, commit };
	}

	async status(result: SaveResult): Promise<BuildStatus> {
		if (!result.commit) return { state: 'live' };
		return buildState(await this.#client.runs(this.#ref, result.commit));
	}
}
