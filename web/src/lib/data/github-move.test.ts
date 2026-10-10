import { describe, expect, it } from 'vitest';
import type { Recipe, SiteIndex } from '$lib/types/recipe';
import { GitHubWriter } from './github-writer';

const ref = { repo: 'owner/cookbook', branch: 'main' };

const recipe = (title: string, extra: Partial<Recipe> = {}): Recipe => ({
	title,
	summary: 'A dish.',
	servings: 2,
	ingredientGroups: [],
	steps: [{ text: 'Cook.' }],
	...extra
});

const stew = recipe('Stew', { image: { src: 'stew.jpg', alt: 'A stew' } });
const pie = recipe('Pie', { related: ['mains/stew', 'mains/soup'] });
const soup = recipe('Soup');

const card = (id: string) => ({
	id,
	slug: id,
	title: id,
	summary: '',
	tags: [],
	times: {},
	servings: 2,
	section: []
});

/** The live site, built before `pie` gained its link to the stew in a later commit. */
const site = {
	built: 'abc',
	source: {
		getIndex: async (): Promise<SiteIndex> => ({
			sections: [
				{
					path: 'mains',
					title: 'Mains',
					recipes: ['mains/stew', 'mains/pie', 'mains/soup'].map(card),
					sections: []
				}
			]
		}),
		getRecipe: async (id: string) =>
			({
				recipe: { 'mains/stew': stew, 'mains/pie': recipe('Pie'), 'mains/soup': soup }[id]
			}) as never
	}
};

function github(files: Record<string, string>) {
	const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
	let blobs = 0;
	const reply = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });
	const fetcher = (async (url: string, init: RequestInit) => {
		const path = new URL(url).pathname.replace(`/repos/${ref.repo}`, '');
		const body = init.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ method: init.method ?? 'GET', path, body });
		if (path.startsWith('/compare/')) {
			return reply({
				status: 'ahead',
				files: [{ filename: 'recipes/mains/pie.json', status: 'modified' }]
			});
		}
		if (path.startsWith('/contents/')) {
			const file = files[decodeURIComponent(path.slice('/contents/'.length))];
			return file === undefined
				? reply({ message: 'Not Found' }, 404)
				: reply({ sha: `sha:${file}`, content: btoa(file) });
		}
		if (path === '/git/blobs') return reply({ sha: `blob-${++blobs}` }, 201);
		if (path.startsWith('/git/ref/')) return reply({ object: { sha: 'head' } });
		if (path.startsWith('/git/commits/')) return reply({ tree: { sha: 'base' } });
		if (path === '/git/trees') return reply({ sha: 'tree' }, 201);
		if (path === '/git/commits') return reply({ sha: 'commit' }, 201);
		return reply({});
	}) as unknown as typeof fetch;
	const tree = () =>
		(calls.filter((call) => call.path === '/git/trees').at(-1)?.body?.tree ?? []) as {
			path: string;
			sha: string | null;
		}[];
	const blobText = (path: string) => {
		const sha = tree().find((entry) => entry.path === path)?.sha;
		const index = Number(sha?.replace('blob-', '')) - 1;
		return calls.filter((call) => call.path === '/git/blobs')[index]?.body?.content as string;
	};
	return { calls, fetcher, tree, blobText };
}

const stored = {
	'recipes/mains/stew.json': JSON.stringify(stew),
	'recipes/mains/stew.jpg': 'jpeg',
	'recipes/mains/pie.json': JSON.stringify(pie)
};

describe('moving a recipe', () => {
	it('writes the new file, the link changes and the photo in one commit', async () => {
		const api = github(stored);
		const writer = new GitHubWriter('token', ref, api.fetcher, site);
		await writer.createSection('desserts/stews', { title: 'Stews' });
		await writer.read('mains/stew');

		const edited = { ...stew, summary: 'Changed.' };
		const result = await writer.move('mains/stew', 'desserts/stews/hotpot', edited, {
			previousImage: 'stew.jpg'
		});

		expect(result).toEqual({ id: 'desserts/stews/hotpot', commit: 'commit' });
		expect(api.calls.filter((call) => call.path === '/git/commits')).toHaveLength(1);
		expect(api.calls.find((call) => call.path === '/git/commits')?.body?.message).toBe(
			'content(recipes): move Stew'
		);
		const entries = api.tree();
		expect(entries.map((entry) => [entry.path, entry.sha === null])).toEqual(
			expect.arrayContaining([
				['recipes/desserts/stews/_section.json', false],
				['recipes/desserts/stews/hotpot.jpg', false],
				['recipes/mains/stew.jpg', true],
				['recipes/mains/pie.json', false],
				['recipes/desserts/stews/hotpot.json', false],
				['recipes/mains/stew.json', true]
			])
		);
		expect(entries).toHaveLength(6);
		expect(entries.find((entry) => entry.path.endsWith('hotpot.jpg'))?.sha).toBe('sha:jpeg');
		const moved = JSON.parse(api.blobText('recipes/desserts/stews/hotpot.json'));
		expect(moved).toMatchObject({ summary: 'Changed.', image: { src: 'hotpot.jpg' } });
		expect(JSON.parse(api.blobText('recipes/mains/pie.json')).related).toEqual([
			'desserts/stews/hotpot',
			'mains/soup'
		]);
	});

	it('uses a new photo instead of moving the old one', async () => {
		const api = github(stored);
		const writer = new GitHubWriter('token', ref, api.fetcher, site);
		await writer.read('mains/stew');
		await writer.move('mains/stew', 'mains/hotpot', stew, {
			previousImage: 'stew.jpg',
			photo: new Blob(['new'], { type: 'image/png' })
		});
		const paths = api.tree().map((entry) => entry.path);
		expect(paths).toContain('recipes/mains/hotpot.png');
		expect(paths).toContain('recipes/mains/stew.jpg');
		expect(JSON.parse(api.blobText('recipes/mains/hotpot.json')).image.src).toBe('hotpot.png');
	});

	it('refuses an address that is taken, and writes nothing', async () => {
		const api = github({ ...stored, 'recipes/mains/hotpot.json': '{}' });
		const writer = new GitHubWriter('token', ref, api.fetcher, site);
		await writer.read('mains/stew');
		await expect(writer.move('mains/stew', 'mains/hotpot', stew, {})).rejects.toMatchObject({
			code: 'conflict'
		});
		expect(api.calls.filter((call) => call.path === '/git/commits')).toHaveLength(0);
	});

	it('refuses when the recipe changed after it was read', async () => {
		const files = { ...stored };
		const api = github(files);
		const writer = new GitHubWriter('token', ref, api.fetcher, site);
		await writer.read('mains/stew');
		files['recipes/mains/stew.json'] = '{"title":"Other"}';
		await expect(writer.move('mains/stew', 'mains/hotpot', stew, {})).rejects.toMatchObject({
			code: 'conflict'
		});
		expect(api.calls.filter((call) => call.path === '/git/commits')).toHaveLength(0);
	});
});

describe('reading every recipe', () => {
	it('sees a link that only an undeployed commit added', async () => {
		const writer = new GitHubWriter('token', ref, github(stored).fetcher, site);
		const found = await writer.readAll();
		expect(found.find((entry) => entry.id === 'mains/pie')?.recipe.related).toContain('mains/stew');
	});
});
