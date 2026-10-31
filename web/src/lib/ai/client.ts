import { SseReader } from './sse';
import type { Recipe } from '$lib/types/recipe';

export type Role = 'user' | 'model';

export interface Turn {
	role: Role;
	text: string;
}

export interface ChatRequest {
	recipeId: string;
	recipe: Recipe;
	history: Turn[];
	question: string;
}

export interface ChatReply {
	reply: string;
	/** The model ran out of room, so the answer may stop mid-sentence. */
	truncated: boolean;
}

export interface ImportResult {
	recipe: Recipe;
	checks: unknown[];
}

export interface ChatOptions {
	/** Called with the answer so far each time more of it arrives. */
	onText?: (text: string) => void;
	/** Called when the main model is too busy and a lighter one is asked instead. */
	onFallback?: () => void;
	signal?: AbortSignal;
}

/** How the AI has fared lately, as far as the service knows; asking it costs no question. */
export interface AiStatus {
	/** Every model was too busy to answer a recent question. */
	busy: boolean;
	/** A model Gemini no longer offers, so the fallback is answering until the owner changes it. */
	retired?: string;
}

export interface AiClient {
	/** Throws when the service cannot be reached at all. */
	status(signal?: AbortSignal): Promise<AiStatus>;
	chat(request: ChatRequest, options?: ChatOptions): Promise<ChatReply>;
	/** `proof` is `adminProof(secret)`; the server backend uses the session cookie instead. */
	importRecipe(text: string, proof?: string): Promise<ImportResult>;
}

/** A failure with a message that is fit to show to a cook. */
export class AiError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status: number,
		readonly retryAfter?: number
	) {
		super(message);
		this.name = 'AiError';
	}
}

/** The server keeps the last ten turns, and cuts each message to 1,000 characters. */
export const HISTORY_TURNS = 10;
export const MESSAGE_CHARS = 1000;

const BUSY = 'The sous-chef could not answer just now. Try again in a moment.';
const OFFLINE = 'The sous-chef could not be reached. Check your connection and try again.';
const STOPPED = 'The answer stopped part way. Try again.';

/** Failures that may well clear if the same question is asked again straight away. */
export const isRetryable = (error: AiError): boolean =>
	['busy', 'unavailable', 'interrupted'].includes(error.code) ||
	(error.status >= 500 && error.code !== 'not_configured');

/** The last turns the server will read, each cut to the length it allows. */
export const recentTurns = (history: Turn[]): Turn[] =>
	history
		.slice(-HISTORY_TURNS)
		.map(({ role, text }) => ({ role, text: text.trim().slice(0, MESSAGE_CHARS) }));

async function send(
	fetcher: typeof fetch,
	url: string,
	body: unknown,
	init: RequestInit
): Promise<Response> {
	let response: Response;
	try {
		response = await fetcher(url, {
			...init,
			method: 'POST',
			headers: { 'content-type': 'application/json', ...init.headers },
			body: JSON.stringify(body)
		});
	} catch {
		if (init.signal?.aborted) throw new AiError(STOPPED, 'aborted', 0);
		throw new AiError(OFFLINE, 'offline', 0);
	}
	if (!response.ok) throw await failure(response);
	return response;
}

export async function post<T>(
	fetcher: typeof fetch,
	url: string,
	body: unknown,
	init: RequestInit = {}
): Promise<T> {
	const response = await send(fetcher, url, body, init);
	return (await response.json()) as T;
}

/**
 * Asks a question. The Worker streams its answer as server-sent events; the self-hosted server
 * answers with JSON. Either is read here, so the callers need not know which they talk to.
 */
export async function chatPost(
	fetcher: typeof fetch,
	url: string,
	body: unknown,
	init: RequestInit,
	{ onText, onFallback, signal }: ChatOptions = {}
): Promise<ChatReply> {
	const response = await send(fetcher, url, body, { ...init, signal });
	if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
		const reply = (await response.json()) as ChatReply;
		onText?.(reply.reply);
		return reply;
	}
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	const events = new SseReader();
	let text = '';
	try {
		for (;;) {
			const { value, done } = await reader.read();
			const arrived = done ? events.finish() : events.push(value);
			for (const { event, data } of arrived) {
				const parsed = JSON.parse(data) as {
					text?: string;
					truncated?: boolean;
					error?: string;
					message?: string;
				};
				if (event === 'status') {
					onFallback?.();
				} else if (event === 'delta' && parsed.text) {
					text += parsed.text;
					onText?.(text);
				} else if (event === 'done') {
					return { reply: text, truncated: parsed.truncated ?? false };
				} else if (event === 'error') {
					throw new AiError(parsed.message || BUSY, parsed.error ?? 'unavailable', response.status);
				}
			}
			if (done) break;
		}
	} catch (error) {
		if (error instanceof AiError) throw error;
		if (signal?.aborted) throw new AiError(STOPPED, 'aborted', 0);
		throw new AiError(STOPPED, 'interrupted', 0);
	} finally {
		reader.releaseLock();
	}
	throw new AiError(STOPPED, 'interrupted', 0);
}

async function failure(response: Response): Promise<AiError> {
	let detail: { error?: string; message?: string } = {};
	try {
		detail = await response.json();
	} catch {
		/* the body was not JSON; the calm default below is shown */
	}
	const wait = Number(response.headers.get('retry-after'));
	return new AiError(
		detail.message || BUSY,
		detail.error ?? 'unavailable',
		response.status,
		Number.isFinite(wait) && wait > 0 ? wait : undefined
	);
}

export function chatBody({ recipeId, recipe, history, question }: ChatRequest) {
	return { recipeId, recipe, history: recentTurns(history), question: question.trim() };
}
