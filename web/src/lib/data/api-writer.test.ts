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
