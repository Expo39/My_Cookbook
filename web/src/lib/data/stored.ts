import type { GitHubClient, RepoRef } from '$lib/admin/github';
import type { Recipe } from '$lib/types/recipe';
import type { RecipeSource } from './source';
import { allRecipes } from './tree';

export interface StoredRecipe {
	id: string;
	recipe: Recipe;
}

/** What the deployed site was built from: its data, and the commit that data came from. */
export interface Site {
	source: Pick<RecipeSource, 'getIndex' | 'getRecipe'>;
	/** Empty when the build did not record a commit. */
	built: string;
}

/** GitHub lists at most this many files in a comparison, so a full list may be cut short. */
const COMPARE_LIMIT = 300;

const idOf = (path: string): string | undefined => {
	const match = /^recipes\/(.+)\.json$/.exec(path);
	return match && !match[1].endsWith('_section') ? match[1] : undefined;
};

/**
 * Every recipe as the branch holds it now. The deployed data is reused for the recipes that have not
 * changed since the build; when that cannot be known, every recipe is read from GitHub.
 */
export async function storedRecipes(
	client: GitHubClient,
	ref: RepoRef,
	site: Site
): Promise<StoredRecipe[]> {
	if (site.built) {
		try {
			const found = await sinceBuild(client, ref, site);
			if (found) return found;
		} catch {
			// Fall through to reading everything.
		}
	}
	return everyRecipe(client, ref);
}

async function sinceBuild(
	client: GitHubClient,
	ref: RepoRef,
	site: Site
): Promise<StoredRecipe[] | undefined> {
	const diff = await client.compare(ref, site.built);
	if (!['ahead', 'identical'].includes(diff.status) || diff.files.length >= COMPARE_LIMIT) {
		return undefined;
	}
	const gone = new Set<string>();
	const changed = new Set<string>();
	for (const file of diff.files) {
		const before = file.previous_filename && idOf(file.previous_filename);
		if (before) gone.add(before);
		const id = idOf(file.filename);
		if (!id) continue;
		(file.status === 'removed' ? gone : changed).add(id);
	}

	const deployed = allRecipes(await site.source.getIndex())
		.map((card) => card.id)
		.filter((id) => !gone.has(id) && !changed.has(id));
	const [kept, fresh] = await Promise.all([
		Promise.all(
			deployed.map(async (id) => ({ id, recipe: (await site.source.getRecipe(id)).recipe }))
		),
		Promise.all(
			[...changed].map(async (id) => {
				const file = await client.file(ref, `recipes/${id}.json`);
				return file ? { id, recipe: JSON.parse(file.text) as Recipe } : undefined;
			})
		)
	]);
	return [...kept, ...fresh.filter((entry) => entry !== undefined)];
}

async function everyRecipe(client: GitHubClient, ref: RepoRef): Promise<StoredRecipe[]> {
	const listing = await client.tree(ref);
	if (listing.truncated) throw new Error('GitHub could not list every recipe.');
	const entries = listing.tree.filter((entry) => entry.type === 'blob' && idOf(entry.path));
	return Promise.all(
		entries.map(async (entry) => ({
			id: idOf(entry.path) as string,
			recipe: JSON.parse(await client.blob(ref, entry.sha)) as Recipe
		}))
	);
}
