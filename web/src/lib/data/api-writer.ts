import type { CheckResult, Recipe, Section } from '$lib/types/recipe';
import { WriteError, type BuildStatus, type RecipeWriter, type SaveResult } from './writer';

/** Talks to `crates/cookbook-server`; the session cookie from `login` authorises each call. */
export class ApiWriter implements RecipeWriter {
	readonly #fetch: typeof fetch;
	readonly #root: string;

	constructor(fetcher: typeof fetch = (...args) => fetch(...args), root = '') {
		this.#fetch = fetcher;
		this.#root = root;
	}

	async #send<T>(path: string, init: RequestInit): Promise<T> {
		let response: Response;
		try {
			response = await this.#fetch(`${this.#root}/api${path}`, { credentials: 'include', ...init });
		} catch {
			throw new WriteError('The server could not be reached.', 'network');
		}
		const body = (await response.json().catch(() => ({}))) as {
			error?: string;
			message?: string;
			results?: CheckResult[];
		};
		if (!response.ok) {
			throw new WriteError(
				body.message ?? `The server refused the request (${response.status}).`,
				body.error ?? 'failed',
				body.results
			);
		}
		return body as T;
	}

	async createSection(path: string, section: Section): Promise<void> {
		await this.#send('/sections', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				path,
				title: section.title,
				...(section.order == null ? {} : { order: section.order }),
				...(section.summary ? { summary: section.summary } : {})
			})
		});
	}

	async uploadImage(id: string, file: Blob): Promise<{ src: string }> {
		const form = new FormData();
		form.append('file', file, 'photo');
		return this.#send<{ src: string }>(`/images/${id}`, { method: 'POST', body: form });
	}

	async save(id: string, recipe: Recipe): Promise<SaveResult> {
		await this.#send(`/recipes/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(recipe)
		});
		return { id };
	}

	async remove(id: string): Promise<SaveResult> {
		await this.#send(`/recipes/${id}`, { method: 'DELETE' });
		return { id };
	}

	async status(): Promise<BuildStatus> {
		return { state: 'live' };
	}
}

export async function serverSession(fetcher: typeof fetch = (...a) => fetch(...a)) {
	const response = await fetcher('/api/session', { credentials: 'include' }).catch(() => null);
	const body = (await response?.json().catch(() => null)) as { authenticated?: boolean } | null;
	return body?.authenticated === true;
}

/** Returns false for a wrong password; throws for anything else. */
export async function serverLogin(
	password: string,
	fetcher: typeof fetch = (...a) => fetch(...a)
): Promise<boolean> {
	const response = await fetcher('/api/session', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ password })
	});
	if (response.status === 401 || response.status === 403) return false;
	if (response.status === 429) throw new Error('Too many attempts. Try again in a few minutes.');
	if (!response.ok) throw new Error(`The server refused the login (${response.status}).`);
	return true;
}

export async function serverLogout(fetcher: typeof fetch = (...a) => fetch(...a)): Promise<void> {
	await fetcher('/api/session', { method: 'DELETE', credentials: 'include' }).catch(
		() => undefined
	);
}
