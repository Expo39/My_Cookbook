import {
	chatBody,
	chatPost,
	post,
	type AiClient,
	type ChatOptions,
	type ChatReply,
	type ChatRequest,
	type ImportResult
} from './client';

/** Talks to the self-hosted server on the same origin; importing uses the editor's session cookie. */
export class ServerClient implements AiClient {
	readonly #prefix: string;
	readonly #fetch: typeof fetch;

	constructor(base = '', fetcher: typeof fetch = fetch) {
		this.#prefix = `${base}/api/ai`;
		this.#fetch = fetcher;
	}

	chat(request: ChatRequest, options?: ChatOptions): Promise<ChatReply> {
		return chatPost(
			this.#fetch,
			`${this.#prefix}/chat`,
			chatBody(request),
			{ credentials: 'same-origin' },
			options
		);
	}

	importRecipe(text: string): Promise<ImportResult> {
		return post(this.#fetch, `${this.#prefix}/import`, { text }, { credentials: 'same-origin' });
	}
}
