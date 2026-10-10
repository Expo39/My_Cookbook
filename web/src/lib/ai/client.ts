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

export interface AiClient {
	chat(request: ChatRequest): Promise<ChatReply>;
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

/** The last turns the server will read, each cut to the length it allows. */
export const recentTurns = (history: Turn[]): Turn[] =>
	history
		.slice(-HISTORY_TURNS)
		.map(({ role, text }) => ({ role, text: text.trim().slice(0, MESSAGE_CHARS) }));

export async function post<T>(
	fetcher: typeof fetch,
	url: string,
	body: unknown,
	init: RequestInit = {}
): Promise<T> {
	let response: Response;
	try {
		response = await fetcher(url, {
			...init,
			method: 'POST',
			headers: { 'content-type': 'application/json', ...init.headers },
			body: JSON.stringify(body)
		});
	} catch {
		throw new AiError(OFFLINE, 'offline', 0);
	}
	if (response.ok) return (await response.json()) as T;
	let detail: { error?: string; message?: string } = {};
	try {
		detail = await response.json();
	} catch {
		/* the body was not JSON; the calm default below is shown */
	}
	const wait = Number(response.headers.get('retry-after'));
	throw new AiError(
		detail.message || BUSY,
		detail.error ?? 'unavailable',
		response.status,
		Number.isFinite(wait) && wait > 0 ? wait : undefined
	);
}

export function chatBody({ recipeId, recipe, history, question }: ChatRequest) {
	return { recipeId, recipe, history: recentTurns(history), question: question.trim() };
}
