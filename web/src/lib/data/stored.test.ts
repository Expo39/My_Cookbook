import { describe, expect, it } from 'vitest';
import { GitHubClient } from '$lib/admin/github';
import type { Recipe, SectionNode, SiteIndex } from '$lib/types/recipe';
import { storedRecipes } from './stored';

const ref = { repo: 'owner/cookbook', branch: 'main' };

const recipe = (title: string, related: string[] = []): Recipe => ({
	title,
	summary: '',
	servings: 2,
	ingredientGroups: [],
	steps: [],
	related
});

const node = (recipes: string[]): SectionNode => ({
	path: 'mains',
	title: 'Mains',
	recipes: recipes.map((id) => ({
		id,
		slug: id,
		title: id,
		summary: '',
		tags: [],
		times: {},
		servings: 2,
		section: []
	})),
	sections: []
});

/** What the live site serves: three recipes, none of which link to `mains/soup` yet. */
const deployed: Record<string, Recipe> = {
	'mains/soup': recipe('Soup'),
	'mains/stew': recipe('Stew'),
	'mains/pie': recipe('Pie', ['mains/stew'])
};
const site = (built: string) => {
	const requested: string[] = [];
	return {
		requested,
		site: {
			built,
			source: {
				getIndex: async (): Promise<SiteIndex> => ({ sections: [node(Object.keys(deployed))] }),
				getRecipe: async (id: string) => {
					requested.push(id);
					return { recipe: deployed[id] } as never;
				}
			}
		}
	};
};

interface Branch {
	compare?: { status?: string; files?: unknown[] } | 404;
	files?: Record<string, Recipe>;
	truncated?: boolean;
}

function github(branch: Branch) {
	const paths: string[] = [];
	const reply = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });
	const fetcher = (async (url: string) => {
		const path = new URL(url).pathname.replace(`/repos/${ref.repo}`, '');
		paths.push(path);
		if (path.startsWith('/compare/')) {
			if (branch.compare === 404 || !branch.compare) return reply({ message: 'Not Found' }, 404);
			return reply({ status: 'ahead', files: [], ...branch.compare });
		}
		if (path.startsWith('/contents/')) {
			const found = branch.files?.[path.slice('/contents/'.length).replace(/\.json$/, '')];
			return found
				? reply({ sha: 's', content: btoa(JSON.stringify(found)) })
				: reply({ message: 'Not Found' }, 404);
		}
		if (path.startsWith('/git/trees/')) {
			return reply({
				truncated: branch.truncated ?? false,
				tree: [
					...Object.keys(branch.files ?? {}).map((file) => ({
						path: `${file}.json`,
						type: 'blob',
						sha: file
					})),
					{ path: 'recipes/mains/_section.json', type: 'blob', sha: 'section' },
					{ path: 'recipes/mains', type: 'tree', sha: 'folder' }
				]
			});
		}
		if (path.startsWith('/git/blobs/')) {
			const file = path.slice('/git/blobs/'.length);
			return reply({ content: btoa(JSON.stringify(branch.files?.[file])) });
		}
		return reply({}, 404);
	}) as unknown as typeof fetch;
	return { paths, client: new GitHubClient('token', fetcher) };
}

const ids = (found: { id: string }[]) => found.map((entry) => entry.id).sort();

describe('the recipes as stored now', () => {
	it('finds a link added after the build by reading only the changed files', async () => {
		const api = github({
			compare: { files: [{ filename: 'recipes/mains/stew.json', status: 'modified' }] },
			files: { 'recipes/mains/stew': recipe('Stew', ['mains/soup']) }
		});
		const live = site('abc123');
		const found = await storedRecipes(api.client, ref, live.site);

		expect(ids(found)).toEqual(['mains/pie', 'mains/soup', 'mains/stew']);
		expect(found.find((entry) => entry.id === 'mains/stew')?.recipe.related).toEqual([
			'mains/soup'
		]);
		expect(live.requested.sort()).toEqual(['mains/pie', 'mains/soup']);
		expect(api.paths).toEqual(['/compare/abc123...main', '/contents/recipes/mains/stew.json']);
	});

	it('adds a recipe created after the build and ignores section files', async () => {
		const api = github({
			compare: {
				files: [
					{ filename: 'recipes/mains/bake.json', status: 'added' },
					{ filename: 'recipes/mains/_section.json', status: 'modified' },
					{ filename: 'web/src/app.html', status: 'modified' }
				]
			},
			files: { 'recipes/mains/bake': recipe('Bake') }
		});
		expect(ids(await storedRecipes(api.client, ref, site('abc').site))).toEqual([
			'mains/bake',
			'mains/pie',
			'mains/soup',
			'mains/stew'
		]);
	});

	it('drops a recipe deleted or renamed after the build', async () => {
		const api = github({
			compare: {
				files: [
					{ filename: 'recipes/mains/pie.json', status: 'removed' },
					{
						filename: 'recipes/mains/hotpot.json',
						status: 'renamed',
						previous_filename: 'recipes/mains/stew.json'
					}
				]
			},
			files: { 'recipes/mains/hotpot': recipe('Hotpot') }
		});
		expect(ids(await storedRecipes(api.client, ref, site('abc').site))).toEqual([
			'mains/hotpot',
			'mains/soup'
		]);
	});

	const everything: Record<string, Recipe> = {
		'recipes/mains/soup': recipe('Soup'),
		'recipes/mains/stew': recipe('Stew', ['mains/soup'])
	};

	it.each([
		['the build commit is unknown', { compare: 404 as const }, ''],
		['the comparison fails', { compare: 404 as const }, 'abc'],
		['the histories diverged', { compare: { status: 'diverged' } }, 'abc'],
		[
			'the comparison is cut short',
			{
				compare: { files: Array.from({ length: 300 }, () => ({ filename: 'x', status: 'added' })) }
			},
			'abc'
		]
	])('reads every recipe from GitHub when %s', async (_name, branch, built) => {
		const api = github({ ...branch, files: everything });
		const live = site(built);
		const found = await storedRecipes(api.client, ref, live.site);

		expect(ids(found)).toEqual(['mains/soup', 'mains/stew']);
		expect(found.find((entry) => entry.id === 'mains/stew')?.recipe.related).toEqual([
			'mains/soup'
		]);
		expect(live.requested).toEqual([]);
		expect(api.paths.filter((path) => path.startsWith('/git/blobs/')).sort()).toEqual([
			'/git/blobs/recipes/mains/soup',
			'/git/blobs/recipes/mains/stew'
		]);
	});

	it('refuses to guess when GitHub cannot list every file', async () => {
		const api = github({ truncated: true, files: everything });
		await expect(storedRecipes(api.client, ref, site('').site)).rejects.toThrow('every recipe');
	});
});
