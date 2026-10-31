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

function github(
	options: { refFailures?: number; files?: Record<string, { sha: string; text: string }> } = {}
) {
	const calls: Call[] = [];
	let blobs = 0;
	let refFailures = options.refFailures ?? 0;
	const fetcher = (async (url: string, init: RequestInit) => {
		const path = new URL(url).pathname.replace(`/repos/${ref.repo}`, '');
		const body = init.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ method: init.method ?? 'GET', path, body });
		const reply = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });
		if (path.startsWith('/contents/')) {
			const file = options.files?.[decodeURIComponent(path.slice('/contents/'.length))];
			return file
				? reply({ sha: file.sha, content: btoa(file.text) })
				: reply({ message: 'Not Found' }, 404);
		}
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
	it.each([
		['../.github/workflows/ci', 'a recipe address that climbs out of the recipes'],
		['desserts/Lemon Tart', 'a name with capitals and spaces'],
		['desserts/tart.yml', 'a name with a dot']
	])('refuses %s (%s) before anything reaches GitHub', async (id) => {
		const api = github();
		const writer = new GitHubWriter('token', ref, api.fetcher);
		await expect(writer.save(id, recipe, { isNew: true })).rejects.toThrow(/is not a recipe file/);
		expect(api.calls.filter((call) => call.method !== 'GET')).toEqual([]);
	});

	it('refuses to delete an old photo whose name points outside the recipe folder', async () => {
		const api = github();
		const writer = new GitHubWriter('token', ref, api.fetcher);
		await expect(
			writer.save('desserts/lemon-tart', recipe, {
				isNew: false,
				previousImage: '../../web/static/admin.json'
			})
		).rejects.toThrow(/is not a recipe file/);
		expect(api.calls.filter((call) => call.method !== 'GET')).toEqual([]);
	});

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
		const update = api.calls.find((call) => call.method === 'PATCH');
		expect(update).toMatchObject({
			method: 'PATCH',
			path: '/git/refs/heads/main',
			body: { sha: 'new-commit', force: false }
		});
	});

	it('deletes the old photo when a new one has a different name', async () => {
		const api = github();
		const withPhoto = { ...recipe, image: { src: 'lemon-tart.jpg', alt: 'A tart' } };
		const writer = new GitHubWriter('t', ref, api.fetcher);
		await writer.uploadImage('d/lemon-tart', new Blob(['x'], { type: 'image/jpeg' }));
		await writer.save('d/lemon-tart', withPhoto, { isNew: false, previousImage: 'lemon-tart.png' });
		expect(api.tree().map((entry) => [entry.path, entry.sha === null])).toEqual([
			['recipes/d/lemon-tart.jpg', false],
			['recipes/d/lemon-tart.json', false],
			['recipes/d/lemon-tart.png', true]
		]);
	});

	it('deletes the photo when the recipe no longer has one', async () => {
		const api = github();
		await new GitHubWriter('t', ref, api.fetcher).save('d/lemon-tart', recipe, {
			isNew: false,
			previousImage: 'lemon-tart.jpg'
		});
		expect(api.tree().map((entry) => [entry.path, entry.sha === null])).toEqual([
			['recipes/d/lemon-tart.json', false],
			['recipes/d/lemon-tart.jpg', true]
		]);
	});

	it('keeps a photo that is still in use', async () => {
		const api = github();
		const withPhoto = { ...recipe, image: { src: 'lemon-tart.png', alt: 'A tart' } };
		await new GitHubWriter('t', ref, api.fetcher).save('d/lemon-tart', withPhoto, {
			isNew: false,
			previousImage: 'lemon-tart.png'
		});
		expect(api.tree().map((entry) => entry.path)).toEqual(['recipes/d/lemon-tart.json']);
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

describe('editing from the stored recipe', () => {
	const stored = (sha: string) => ({
		'recipes/d/tart.json': { sha, text: JSON.stringify(recipe) }
	});

	it('reads the recipe from the branch, not the published site', async () => {
		const api = github({ files: stored('v1') });
		const read = await new GitHubWriter('t', ref, api.fetcher).read('d/tart');
		expect(read).toEqual(recipe);
		expect(api.calls[0].path).toBe('/contents/recipes/d/tart.json');
	});

	it('says when the recipe is not stored', async () => {
		await expect(new GitHubWriter('t', ref, github().fetcher).read('d/tart')).rejects.toThrow(
			'no recipe called'
		);
	});

	it('refuses to save over a recipe that changed after it was read', async () => {
		const files = stored('v1');
		const api = github({ files });
		const writer = new GitHubWriter('t', ref, api.fetcher);
		await writer.read('d/tart');
		files['recipes/d/tart.json'] = { sha: 'v2', text: '{}' };
		await expect(writer.save('d/tart', recipe, { isNew: false })).rejects.toMatchObject({
			code: 'conflict'
		});
		expect(api.calls.some((call) => call.path === '/git/commits')).toBe(false);
	});

	it('saves when the recipe is as it was read', async () => {
		const api = github({ files: stored('v1') });
		const writer = new GitHubWriter('t', ref, api.fetcher);
		await writer.read('d/tart');
		await writer.save('d/tart', recipe, { isNew: false });
		expect(api.calls.some((call) => call.path === '/git/commits')).toBe(true);
	});

	it('refuses a new recipe whose address was taken in the meantime', async () => {
		const api = github({ files: stored('v1') });
		await expect(
			new GitHubWriter('t', ref, api.fetcher).save('d/tart', recipe, { isNew: true })
		).rejects.toMatchObject({ code: 'conflict' });
	});

	it('refuses to delete a recipe that changed after it was read', async () => {
		const files = stored('v1');
		const api = github({ files });
		const writer = new GitHubWriter('t', ref, api.fetcher);
		await writer.read('d/tart');
		files['recipes/d/tart.json'] = { sha: 'v2', text: '{}' };
		await expect(writer.remove('d/tart', { title: 'Tart' })).rejects.toMatchObject({
			code: 'conflict'
		});
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

	it('treats a cancelled run as superseded by a later build, not as a failure', () => {
		expect(buildState([run('CI', 'completed', 'cancelled')])).toEqual({ state: 'superseded' });
		expect(
			buildState([run('CI', 'completed', 'success'), run('Deploy', 'completed', 'cancelled')])
		).toEqual({ state: 'superseded' });
	});

	it('still reports a failure alongside a cancelled run', () => {
		expect(
			buildState([run('CI', 'completed', 'cancelled'), run('Deploy', 'completed', 'failure')])
		).toMatchObject({ state: 'failed' });
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
