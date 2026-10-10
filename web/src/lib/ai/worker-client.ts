import {
	chatBody,
	post,
	type AiClient,
	type ChatReply,
	type ChatRequest,
	type ImportResult
} from './client';

/** Talks to the Cloudflare Worker at `endpoint`, which holds the Gemini key. */
export class WorkerClient implements AiClient {
	readonly #endpoint: string;
	readonly #fetch: typeof fetch;

	constructor(endpoint: string, fetcher: typeof fetch = fetch) {
		this.#endpoint = endpoint.replace(/\/$/, '');
		this.#fetch = fetcher;
	}

	chat(request: ChatRequest): Promise<ChatReply> {
		return post(this.#fetch, `${this.#endpoint}/chat`, chatBody(request));
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
