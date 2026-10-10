// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '$lib/types/recipe';
import { AiError, HISTORY_TURNS, MESSAGE_CHARS, recentTurns } from './client';
import { adminProof } from './proof';
import { ServerClient } from './server-client';
import { WorkerClient } from './worker-client';

const recipe = { title: 'Soup' } as Recipe;
const json = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), { status: 200, ...init });
const request = { recipeId: 'soups/soup', recipe, history: [], question: ' Can I freeze it? ' };

function mocked(response: Response | Error) {
	return vi.fn<typeof fetch>(async () => {
		if (response instanceof Error) throw response;
		return response;
	});
}

describe('adminProof', () => {
	it('is the timestamp and the hex HMAC-SHA256 of it', async () => {
		const proof = await adminProof('s3cret', 1_700_000_000_123);
		const expected = createHmac('sha256', 's3cret').update('1700000000123').digest('hex');
		expect(proof).toBe(`1700000000123.${expected}`);
		expect(proof).toMatch(/^\d{13}\.[0-9a-f]{64}$/);
	});

	it('stamps the current time by default', async () => {
		const before = Date.now();
		const stamp = Number((await adminProof('k')).split('.')[0]);
		expect(stamp).toBeGreaterThanOrEqual(before);
	});
});

describe('recentTurns', () => {
	it('keeps the last turns the server reads, cut to its message length', () => {
		const history = Array.from({ length: 14 }, (_, i) => ({
			role: i % 2 ? ('model' as const) : ('user' as const),
			text: `${i} ${'x'.repeat(2000)}`
		}));
		const turns = recentTurns(history);
		expect(turns).toHaveLength(HISTORY_TURNS);
		expect(turns[0].text.startsWith('4 ')).toBe(true);
		expect(turns.every((turn) => turn.text.length <= MESSAGE_CHARS)).toBe(true);
	});
});

describe('WorkerClient', () => {
	it('posts the chat to the endpoint and returns the reply', async () => {
		const fetcher = mocked(json({ reply: 'Yes, for three months.', truncated: false }));
		const client = new WorkerClient('https://ai.example.test/', fetcher);
		const result = await client.chat(request);
		expect(result).toEqual({ reply: 'Yes, for three months.', truncated: false });
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://ai.example.test/chat');
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual({
			recipeId: 'soups/soup',
			recipe,
			history: [],
			question: 'Can I freeze it?'
		});
	});

	it('sends the admin proof with an import', async () => {
		const fetcher = mocked(json({ recipe, checks: [] }));
		await new WorkerClient('https://ai.example.test', fetcher).importRecipe(
			'Soup\n1 onion',
			'1.ab'
		);
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://ai.example.test/import');
		expect(new Headers(init?.headers).get('x-admin-proof')).toBe('1.ab');
		expect(JSON.parse(String(init?.body))).toEqual({ text: 'Soup\n1 onion' });
	});

	it('shows the message the server gives, and how long to wait', async () => {
		const fetcher = mocked(
			json(
				{ error: 'rate_limited', message: 'That is enough for now. Try again in 20 minutes.' },
				{ status: 429, headers: { 'retry-after': '1200' } }
			)
		);
		const error = await new WorkerClient('https://x.test', fetcher).chat(request).catch((e) => e);
		expect(error).toBeInstanceOf(AiError);
		expect(error).toMatchObject({
			message: 'That is enough for now. Try again in 20 minutes.',
			code: 'rate_limited',
			status: 429,
			retryAfter: 1200
		});
	});

	it('stays calm when the reply is not JSON or the network is down', async () => {
		const broken = await new WorkerClient(
			'https://x.test',
			mocked(new Response('oops', { status: 502 }))
		)
			.chat(request)
			.catch((e) => e);
		expect(broken.message).toMatch(/could not answer just now/);
		const offline = await new WorkerClient('https://x.test', mocked(new TypeError('failed')))
			.chat(request)
			.catch((e) => e);
		expect(offline).toMatchObject({ code: 'offline', status: 0 });
		expect(offline.message).toMatch(/connection/);
	});
});

describe('ServerClient', () => {
	it('uses the same-origin API with credentials and no proof header', async () => {
		const fetcher = mocked(json({ reply: 'Yes.', truncated: true }));
		const client = new ServerClient('/cookbook', fetcher);
		expect((await client.chat(request)).truncated).toBe(true);
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('/cookbook/api/ai/chat');
		expect(init?.credentials).toBe('same-origin');

		const importing = mocked(json({ recipe, checks: [] }));
		await new ServerClient('', importing).importRecipe('text');
		expect(importing.mock.calls[0][0]).toBe('/api/ai/import');
	});
});
