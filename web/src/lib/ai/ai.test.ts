// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '$lib/types/recipe';
import { AiError, HISTORY_TURNS, isRetryable, MESSAGE_CHARS, recentTurns } from './client';
import { SseReader } from './sse';
import { adminProof } from './proof';
import { ServerClient } from './server-client';
import { WorkerClient } from './worker-client';

const recipe = { title: 'Soup' } as Recipe;
const json = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), { status: 200, ...init });
const request = { recipeId: 'soups/soup', recipe, history: [], question: ' Can I freeze it? ' };
const human = async () => undefined;

/** A streamed answer, delivered in pieces of `size` characters. */
function streamed(events: string, size = 5): Response {
	const bytes = new TextEncoder().encode(events);
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
			controller.close();
		}
	});
	return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

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
		const client = new WorkerClient('https://ai.example.test/', fetcher, human);
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
		await new WorkerClient('https://ai.example.test', fetcher, human).importRecipe(
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
		const error = await new WorkerClient('https://x.test', fetcher, human)
			.chat(request)
			.catch((e) => e);
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
			mocked(new Response('oops', { status: 502 })),
			human
		)
			.chat(request)
			.catch((e) => e);
		expect(broken.message).toMatch(/could not answer just now/);
		const offline = await new WorkerClient('https://x.test', mocked(new TypeError('failed')), human)
			.chat(request)
			.catch((e) => e);
		expect(offline).toMatchObject({ code: 'offline', status: 0 });
		expect(offline.message).toMatch(/connection/);
	});
});

describe('a streamed answer', () => {
	it('arrives piece by piece and ends with whether it was cut short', async () => {
		const fetcher = mocked(
			streamed(
				event('delta', { text: 'Yes, for ' }) +
					event('delta', { text: 'three months.' }) +
					event('done', { truncated: false })
			)
		);
		const seen: string[] = [];
		const reply = await new WorkerClient('https://x.test', fetcher, human).chat(request, {
			onText: (text) => seen.push(text)
		});
		expect(reply).toEqual({ reply: 'Yes, for three months.', truncated: false });
		expect(seen).toEqual(['Yes, for ', 'Yes, for three months.']);
	});

	it('reports an error event with its message', async () => {
		const fetcher = mocked(
			streamed(event('error', { error: 'blocked', message: 'Try rephrasing the question.' }))
		);
		const error = await new WorkerClient('https://x.test', fetcher, human)
			.chat(request)
			.catch((e) => e);
		expect(error).toMatchObject({ code: 'blocked', message: 'Try rephrasing the question.' });
		expect(isRetryable(error)).toBe(false);
	});

	it('treats a stream that stops without finishing as interrupted, worth asking again', async () => {
		const fetcher = mocked(streamed(event('delta', { text: 'Half' })));
		const error = await new WorkerClient('https://x.test', fetcher, human)
			.chat(request)
			.catch((e) => e);
		expect(error).toMatchObject({ code: 'interrupted' });
		expect(isRetryable(error)).toBe(true);
	});

	it('sends the Turnstile token when the site has one', async () => {
		const fetcher = mocked(json({ reply: 'Yes.', truncated: false }));
		await new WorkerClient('https://x.test', fetcher, async () => 'tok').chat(request);
		expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-turnstile-token')).toBe('tok');
	});

	it('says a busy sous-chef is worth retrying, and a daily limit is not', () => {
		expect(isRetryable(new AiError('x', 'busy', 503))).toBe(true);
		expect(isRetryable(new AiError('x', 'quota', 429))).toBe(false);
		expect(isRetryable(new AiError('x', 'rate_limited', 429))).toBe(false);
		expect(isRetryable(new AiError('x', 'not_configured', 503))).toBe(false);
	});
});

describe('SseReader', () => {
	it('finds events however the text is split, with CRLF line ends', () => {
		const text = 'event: delta\r\ndata: {"a":1}\r\n\r\ndata: plain\n\n';
		for (const size of [1, 2, 7, text.length]) {
			const reader = new SseReader();
			const found = [];
			for (let i = 0; i < text.length; i += size)
				found.push(...reader.push(text.slice(i, i + size)));
			expect(found).toEqual([
				{ event: 'delta', data: '{"a":1}' },
				{ event: 'message', data: 'plain' }
			]);
		}
	});

	it('reads a last event that has no blank line after it', () => {
		const reader = new SseReader();
		expect(reader.push('data: x')).toEqual([]);
		expect(reader.finish()).toEqual([{ event: 'message', data: 'x' }]);
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

describe('the sous-chef status and fallbacks', () => {
	it('reports a lighter model stepping in, and names the model that answers', async () => {
		const fetcher = mocked(
			streamed(
				event('status', { state: 'fallback' }) +
					event('model', { model: 'gemini-flash-lite-latest', fallback: true }) +
					event('delta', { text: 'Yes.' }) +
					event('done', { truncated: false })
			)
		);
		const onFallback = vi.fn();
		const onModel = vi.fn();
		const reply = await new WorkerClient('https://ai.test', fetcher, human).chat(request, {
			onFallback,
			onModel
		});
		expect(reply).toEqual({ reply: 'Yes.', truncated: false });
		expect(onFallback).toHaveBeenCalledExactlyOnceWith('busy');
		expect(onModel).toHaveBeenCalledWith('gemini-flash-lite-latest', true);
	});

	it('says when the lighter model steps in because the main one was slow to start', async () => {
		const fetcher = mocked(
			streamed(
				event('model', { model: 'gemini-3.8-flash', fallback: false }) +
					event('status', { state: 'fallback', reason: 'slow' }) +
					event('model', { model: 'gemini-flash-lite-latest', fallback: true }) +
					event('delta', { text: 'Yes.' }) +
					event('done', { truncated: false })
			)
		);
		const onFallback = vi.fn();
		const onModel = vi.fn();
		const reply = await new WorkerClient('https://ai.test', fetcher, human).chat(request, {
			onFallback,
			onModel
		});
		expect(reply).toEqual({ reply: 'Yes.', truncated: false });
		expect(onFallback).toHaveBeenCalledExactlyOnceWith('slow');
		expect(onModel).toHaveBeenLastCalledWith('gemini-flash-lite-latest', true);
	});

	it('passes on the high-demand message when every model is busy', async () => {
		const fetcher = mocked(
			streamed(
				event('error', {
					error: 'unavailable',
					message: 'The sous-chef is unavailable due to high demand. Try again in a few minutes.'
				})
			)
		);
		await expect(new WorkerClient('https://ai.test', fetcher, human).chat(request)).rejects.toThrow(
			/unavailable due to high demand/
		);
	});

	it('reads the status without asking a question: busy, and a retired model', async () => {
		const fetcher = mocked(json({ gemini: 'busy', retired: 'gemini-3.8-flash' }));
		const status = await new WorkerClient('https://ai.test', fetcher, human).status();
		expect(status).toEqual({ busy: true, retired: 'gemini-3.8-flash' });
		expect(fetcher.mock.calls[0][0]).toBe('https://ai.test/status');
	});

	it('treats a quiet, healthy service as ready', async () => {
		const fetcher = mocked(json({ gemini: 'ok', retired: null }));
		expect(await new WorkerClient('https://ai.test', fetcher, human).status()).toEqual({
			busy: false,
			retired: undefined
		});
	});

	it('throws when the service answers with an error, so the page can say it is unreachable', async () => {
		const fetcher = mocked(new Response('down', { status: 503 }));
		await expect(new WorkerClient('https://ai.test', fetcher, human).status()).rejects.toThrow();
	});

	it('the self-hosted server is the site itself, so it is always reachable', async () => {
		expect(await new ServerClient('').status()).toEqual({ busy: false });
	});

	it('sends the Turnstile token with the question', async () => {
		const fetcher = mocked(streamed(event('done', { truncated: false })));
		await new WorkerClient('https://ai.test', fetcher, async () => 'person-token').chat(request);
		const init = fetcher.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>)['x-turnstile-token']).toBe('person-token');
	});
});
