import { describe, expect, it } from 'vitest';
import { ApiWriter } from './api-writer';

function server(handler: (path: string, call: number) => Response) {
	const paths: string[] = [];
	const fetcher = (async (url: string) => {
		paths.push(url);
		return handler(url, paths.length);
	}) as unknown as typeof fetch;
	return { paths, writer: new ApiWriter(fetcher) };
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

describe('ApiWriter retries', () => {
	it('counts a section that already exists as done', async () => {
		const { writer } = server(() =>
			json({ error: 'exists', message: 'That section already exists.' }, 409)
		);
		await expect(writer.createSection('desserts', { title: 'Desserts' })).resolves.toBeUndefined();
	});

	it('still refuses a section for any other reason', async () => {
		const { writer } = server(() => json({ error: 'invalid', message: 'No.' }, 422));
		await expect(writer.createSection('desserts', { title: 'D' })).rejects.toThrow('No.');
	});

	it('does not send a photo again once it has been written', async () => {
		const { paths, writer } = server(() => json({ src: 'tart.jpg' }, 201));
		const photo = new Blob(['jpeg']);
		expect(await writer.uploadImage('desserts/tart', photo)).toEqual({ src: 'tart.jpg' });
		expect(await writer.uploadImage('desserts/tart', photo)).toEqual({ src: 'tart.jpg' });
		expect(paths).toHaveLength(1);
	});

	it('sends the photo again when the recipe address changed', async () => {
		const { paths, writer } = server(() => json({ src: 'x.jpg' }, 201));
		const photo = new Blob(['jpeg']);
		await writer.uploadImage('desserts/tart', photo);
		await writer.uploadImage('desserts/pie', photo);
		expect(paths).toHaveLength(2);
	});
});

describe('ApiWriter version tags', () => {
	const recipe = { title: 'Tart', summary: '', servings: 2, ingredientGroups: [], steps: [] };

	function tagged() {
		const calls: { path: string; init: RequestInit }[] = [];
		const fetcher = (async (path: string, init: RequestInit = {}) => {
			calls.push({ path, init });
			if (!init.method) {
				return new Response(JSON.stringify({ recipe }), { headers: { ETag: '"one"' } });
			}
			return new Response(JSON.stringify({ id: 'desserts/pie' }), { headers: { ETag: '"two"' } });
		}) as unknown as typeof fetch;
		const headers = (call: number) => new Headers(calls[call].init.headers);
		return { calls, headers, writer: new ApiWriter(fetcher) };
	}

	it('sends the tag it read when it saves', async () => {
		const { headers, writer } = tagged();
		await writer.read('desserts/tart');
		await writer.save('desserts/tart', recipe, { isNew: false });
		expect(headers(1).get('If-Match')).toBe('"one"');
	});

	it('keeps the tag a save returns for the next one', async () => {
		const { headers, writer } = tagged();
		await writer.read('desserts/tart');
		await writer.save('desserts/tart', recipe, { isNew: false });
		await writer.save('desserts/tart', recipe, { isNew: false });
		expect(headers(2).get('If-Match')).toBe('"two"');
	});

	it('asks for the file not to exist when the recipe is new', async () => {
		const { headers, writer } = tagged();
		await writer.save('desserts/tart', recipe, { isNew: true });
		expect(headers(0).get('If-None-Match')).toBe('*');
		expect(headers(0).has('If-Match')).toBe(false);
	});

	it('sends the tag when it deletes', async () => {
		const { headers, writer } = tagged();
		await writer.read('desserts/tart');
		await writer.remove('desserts/tart');
		expect(headers(1).get('If-Match')).toBe('"one"');
	});

	it('reports a conflict in the same words as the GitHub writer', async () => {
		const fetcher = (async (_path: string, init: RequestInit = {}) =>
			init.method
				? new Response(JSON.stringify({ error: 'conflict', message: 'Server words.' }), {
						status: 412
					})
				: new Response(JSON.stringify({ recipe }), {
						headers: { ETag: '"one"' }
					})) as unknown as typeof fetch;
		const writer = new ApiWriter(fetcher);
		await writer.read('desserts/tart');
		const error = await writer
			.save('desserts/tart', recipe, { isNew: false })
			.catch((caught: unknown) => caught);
		expect(error).toMatchObject({ code: 'conflict' });
		expect((error as Error).message).toMatch(/was changed .* Nothing was saved/);
	});

	it('moves with the tag, then saves the edits with the new one', async () => {
		const { calls, headers, writer } = tagged();
		await writer.read('desserts/tart');
		const result = await writer.move('desserts/tart', 'desserts/pie', recipe, {});
		expect(result).toEqual({ id: 'desserts/pie' });
		expect(calls[1].path).toBe('/api/recipes/desserts/tart/move');
		expect(calls[1].init.body).toBe(JSON.stringify({ to: 'desserts/pie' }));
		expect(headers(1).get('If-Match')).toBe('"one"');
		expect(calls[2].path).toBe('/api/recipes/desserts/pie');
		expect(headers(2).get('If-Match')).toBe('"two"');
	});

	it('says what was done when the edits fail after the move', async () => {
		let step = 0;
		const fetcher = (async (_path: string, init: RequestInit = {}) => {
			step++;
			if (!init.method)
				return new Response(JSON.stringify({ recipe }), { headers: { ETag: '"one"' } });
			return step === 3
				? new Response(JSON.stringify({ error: 'invalid', message: 'No.' }), { status: 422 })
				: new Response(JSON.stringify({ id: 'desserts/pie' }), { headers: { ETag: '"two"' } });
		}) as unknown as typeof fetch;
		const writer = new ApiWriter(fetcher);
		await writer.read('desserts/tart');
		await expect(writer.move('desserts/tart', 'desserts/pie', recipe, {})).rejects.toThrow(
			/was moved to desserts\/pie, but your other edits were not saved: No\./
		);
	});

	it('will not move a recipe it has not read', async () => {
		const { calls, writer } = tagged();
		await expect(writer.move('desserts/tart', 'desserts/pie', recipe, {})).rejects.toThrow(
			/opened/
		);
		expect(calls).toHaveLength(0);
	});
});
