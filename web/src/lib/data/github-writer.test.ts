import { describe, expect, it } from 'vitest';
import { buildState, type WorkflowRun } from '$lib/admin/github';
import type { Recipe } from '$lib/types/recipe';
import { GitHubWriter } from './github-writer';

const ref = { repo: 'owner/cookbook', branch: 'main' };

const recipe: Recipe = {
	title: 'Lemon Tart',
	summary: 'A sharp tart.',
	servings: 8,
	ingredientGroups: [{ items: [{ amount: { qty: 200, unit: 'g' }, item: 'sugar' }] }],
	steps: [{ text: 'Bake.' }]
};

interface Call {
	method: string;
	path: string;
	body?: Record<string, unknown>;
}

function github(options: { refFailures?: number } = {}) {
	const calls: Call[] = [];
	let blobs = 0;
	let refFailures = options.refFailures ?? 0;
	const fetcher = (async (url: string, init: RequestInit) => {
		const path = new URL(url).pathname.replace(`/repos/${ref.repo}`, '');
		const body = init.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ method: init.method ?? 'GET', path, body });
		const reply = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });
		if (path === '/git/blobs') return reply({ sha: `blob-${++blobs}` }, 201);
		if (path.startsWith('/git/ref/')) return reply({ object: { sha: `head-${calls.length}` } });
		if (path.startsWith('/git/commits/')) return reply({ tree: { sha: 'base-tree' } });
		if (path === '/git/trees') return reply({ sha: 'new-tree' }, 201);
		if (path === '/git/commits') return reply({ sha: 'new-commit' }, 201);
		if (path.startsWith('/git/refs/')) {
			if (refFailures-- > 0) return reply({ message: 'Update is not a fast forward' }, 422);
			return reply({});
		}
		return reply({ workflow_runs: [] });
	}) as unknown as typeof fetch;
	const tree = () =>
		(calls.filter((call) => call.path === '/git/trees').at(-1)?.body?.tree ?? []) as {
			path: string;
			sha: string | null;
			mode: string;
		}[];
	return { calls, fetcher, tree };
}

describe('GitHubWriter', () => {
	it('commits a new recipe on its own in one commit', async () => {
		const api = github();
		const writer = new GitHubWriter('token', ref, api.fetcher);
		const result = await writer.save('desserts/lemon-tart', recipe, { isNew: true });

		expect(result).toEqual({ id: 'desserts/lemon-tart', commit: 'new-commit' });
		expect(api.calls.filter((call) => call.path === '/git/commits')).toHaveLength(1);
		const blob = api.calls.find((call) => call.path === '/git/blobs')?.body;
		expect(blob?.encoding).toBe('utf-8');
		expect(JSON.parse(blob?.content as string)).toEqual(recipe);
		expect(api.tree().map((entry) => entry.path)).toEqual(['recipes/desserts/lemon-tart.json']);
		expect(api.calls.find((call) => call.path === '/git/commits')?.body).toMatchObject({
			message: 'content(recipes): add Lemon Tart',
			tree: 'new-tree',
			parents: [expect.stringMatching(/^head-/)]
		});
		const update = api.calls.at(-1);
		expect(update).toMatchObject({
			method: 'PATCH',
			path: '/git/refs/heads/main',
			body: { sha: 'new-commit', force: false }
		});
	});

	it('writes the recipe as the Rust tool would', async () => {
		const api = github();
		await new GitHubWriter('t', ref, api.fetcher).save('d/tart', recipe, { isNew: false });
		const content = api.calls.find((call) => call.path === '/git/blobs')?.body?.content as string;
		expect(content.startsWith('{\n  "title": "Lemon Tart",\n  "summary"')).toBe(true);
		expect(content.endsWith('}\n')).toBe(true);
	});

	it('words an edit as an update', async () => {
		const api = github();
		await new GitHubWriter('t', ref, api.fetcher).save('d/tart', recipe, { isNew: false });
		expect(api.calls.find((call) => call.path === '/git/commits')?.body?.message).toBe(
			'content(recipes): update Lemon Tart'
		);
	});

	it('puts a staged section and photo in the same commit as the recipe', async () => {
		const api = github();
		const writer = new GitHubWriter('token', ref, api.fetcher);
		await writer.createSection('desserts/tarts', { title: 'Tarts' });
		const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
		const { src } = await writer.uploadImage('desserts/tarts/lemon-tart', photo);
		await writer.save(
			'desserts/tarts/lemon-tart',
			{ ...recipe, image: { src, alt: 'A tart' } },
			{
				isNew: true
			}
		);

		expect(src).toBe('lemon-tart.jpg');
		expect(api.calls.filter((call) => call.path === '/git/commits')).toHaveLength(1);
		expect(
			api
				.tree()
				.map((entry) => entry.path)
				.sort()
		).toEqual([
			'recipes/desserts/tarts/_section.json',
			'recipes/desserts/tarts/lemon-tart.jpg',
			'recipes/desserts/tarts/lemon-tart.json'
		]);
		const blobs = api.calls.filter((call) => call.path === '/git/blobs').map((c) => c.body);
		expect(blobs.find((blob) => blob?.encoding === 'base64')?.content).toBe('AQID');
		const section = blobs.find((blob) => String(blob?.content).includes('"Tarts"'));
		expect(JSON.parse(section?.content as string)).toEqual({ title: 'Tarts' });
	});

	it('does not repeat staged files in the next commit', async () => {
		const api = github();
		const writer = new GitHubWriter('token', ref, api.fetcher);
		await writer.createSection('desserts/tarts', { title: 'Tarts' });
		await writer.save('desserts/tarts/a', recipe, { isNew: true });
		await writer.save('desserts/tarts/b', recipe, { isNew: true });
		expect(api.tree().map((entry) => entry.path)).toEqual(['recipes/desserts/tarts/b.json']);
	});

	it('deletes a recipe and its photo in one commit', async () => {
		const api = github();
		const writer = new GitHubWriter('token', ref, api.fetcher);
		await writer.remove('desserts/tarts/lemon-tart', {
			title: 'Lemon Tart',
			image: 'lemon-tart.jpg'
		});

		expect(api.calls.some((call) => call.path === '/git/blobs')).toBe(false);
		expect(api.tree()).toEqual([
			{ path: 'recipes/desserts/tarts/lemon-tart.json', mode: '100644', type: 'blob', sha: null },
			{ path: 'recipes/desserts/tarts/lemon-tart.jpg', mode: '100644', type: 'blob', sha: null }
		]);
		expect(api.calls.find((call) => call.path === '/git/commits')?.body?.message).toBe(
			'content(recipes): remove Lemon Tart'
		);
	});

	it('deletes a recipe with no photo as a single file', async () => {
		const api = github();
		await new GitHubWriter('t', ref, api.fetcher).remove('d/tart', { title: 'Tart' });
		expect(api.tree().map((entry) => entry.path)).toEqual(['recipes/d/tart.json']);
	});

	it('builds on the new head when the branch moved while it worked', async () => {
		const api = github({ refFailures: 1 });
		await new GitHubWriter('t', ref, api.fetcher).save('d/tart', recipe, { isNew: true });
		expect(api.calls.filter((call) => call.path === '/git/commits')).toHaveLength(2);
		expect(api.calls.filter((call) => call.method === 'PATCH')).toHaveLength(2);
	});

	it('explains a refusal in plain words', async () => {
		const fetcher = (async () =>
			new Response(JSON.stringify({ message: 'Bad credentials' }), {
				status: 401
			})) as unknown as typeof fetch;
		await expect(
			new GitHubWriter('bad', ref, fetcher).save('d/tart', recipe, { isNew: true })
		).rejects.toThrow('GitHub did not accept the token');
	});

	it('sends the token and no other secret', async () => {
		const seen: Headers[] = [];
		const fetcher = (async (_url: string, init: RequestInit) => {
			seen.push(new Headers(init.headers));
			return new Response(JSON.stringify({ workflow_runs: [] }));
		}) as unknown as typeof fetch;
		await new GitHubWriter('secret-token', ref, fetcher).status({ id: 'a', commit: 'abc' });
		expect(seen[0].get('authorization')).toBe('Bearer secret-token');
	});
});

describe('build status', () => {
	const run = (name: string, status: string, conclusion: string | null): WorkflowRun => ({
		id: 1,
		name,
		status,
		conclusion,
		html_url: `https://github.com/run/${name}`
	});

	it('is building until the deploy has finished', () => {
		expect(buildState([])).toEqual({ state: 'building' });
		expect(
			buildState([run('CI', 'completed', 'success'), run('Deploy', 'in_progress', null)])
		).toEqual({
			state: 'building'
		});
	});

	it('is live once the deploy has succeeded', () => {
		expect(
			buildState([run('CI', 'completed', 'success'), run('Deploy', 'completed', 'success')])
		).toEqual({
			state: 'live'
		});
	});

	it('links the run that failed', () => {
		expect(buildState([run('CI', 'completed', 'failure')])).toEqual({
			state: 'failed',
			url: 'https://github.com/run/CI'
		});
	});

	it('is live straight away on a server without a build', async () => {
		const status = await new GitHubWriter('t', ref, github().fetcher).status({ id: 'a' });
		expect(status).toEqual({ state: 'live' });
	});
});
