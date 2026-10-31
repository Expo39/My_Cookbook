import {
	AiError,
	chatBody,
	chatPost,
	post,
	type AiClient,
	type AiStatus,
	type ChatOptions,
	type ChatReply,
	type ChatRequest,
	type ImportResult
} from './client';
import { turnstileToken } from './turnstile';

/** Talks to the Cloudflare Worker at `endpoint`, which holds the Gemini key. */
export class WorkerClient implements AiClient {
	readonly #endpoint: string;
	readonly #fetch: typeof fetch;
	readonly #human: () => Promise<string | undefined>;

	constructor(
		endpoint: string,
		fetcher: typeof fetch = fetch,
		human: () => Promise<string | undefined> = turnstileToken
	) {
		this.#endpoint = endpoint.replace(/\/$/, '');
		this.#fetch = fetcher;
		this.#human = human;
	}

	async status(signal?: AbortSignal): Promise<AiStatus> {
		const response = await this.#fetch(`${this.#endpoint}/status`, { signal, cache: 'no-store' });
		if (!response.ok)
			throw new AiError('The sous-chef cannot be reached.', 'unreachable', response.status);
		const { gemini } = (await response.json()) as { gemini?: string };
		return gemini === 'busy' ? 'busy' : 'ok';
	}

	async chat(request: ChatRequest, options?: ChatOptions): Promise<ChatReply> {
		let token: string | undefined;
		try {
			token = await this.#human();
		} catch {
			throw new AiError(
				'The sous-chef could not check that you are a person. Reload the page and ask again.',
				'turnstile',
				0
			);
		}
		return chatPost(
			this.#fetch,
			`${this.#endpoint}/chat`,
			chatBody(request),
			{ headers: token ? { 'x-turnstile-token': token } : {} },
			options
		);
	}

	importRecipe(text: string, proof?: string): Promise<ImportResult> {
		return post(
			this.#fetch,
			`${this.#endpoint}/import`,
			{ text },
			{ headers: proof ? { 'x-admin-proof': proof } : {} }
		);
	}
}
