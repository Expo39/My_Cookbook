import type { CheckResult, Recipe, Section } from '$lib/types/recipe';
import { ApiSource } from './api-source';
import { allRecipes } from './tree';
import { RecipeNotFoundError } from './source';
import type { StoredRecipe } from './stored';
import {
	CHANGED_SERVER_MESSAGE,
	WriteError,
	type BuildStatus,
	type RecipeWriter,
	type SaveResult
} from './writer';

/** Photos already written, so a retry after a failed save does not send them again. */
const written = new WeakMap<Blob, { id: string; src: string }>();

/** Talks to `crates/cookbook-server`; the session cookie from `login` authorises each call. */
export class ApiWriter implements RecipeWriter {
	readonly #fetch: typeof fetch;
	readonly #root: string;
	/** The version tag each recipe had when it was read or last written. */
	readonly #tags = new Map<string, string>();

	constructor(fetcher: typeof fetch = (...args) => fetch(...args), root = '') {
		this.#fetch = fetcher;
		this.#root = root;
	}

	async read(id: string): Promise<Recipe> {
		let response: Response;
		try {
			response = await this.#fetch(`${this.#root}/api/recipes/${id}`, { credentials: 'include' });
		} catch {
			throw new WriteError('The server could not be reached.', 'network');
		}
		if (response.status === 404) throw new RecipeNotFoundError(id);
		if (!response.ok) throw new Error(`Could not read recipe ${id} (${response.status}).`);
		const tag = response.headers.get('ETag');
		if (tag) this.#tags.set(id, tag);
		else this.#tags.delete(id);
		return ((await response.json()) as { recipe: Recipe }).recipe;
	}

	async readAll(): Promise<StoredRecipe[]> {
		const source = new ApiSource(this.#fetch);
		const cards = allRecipes(await source.getIndex());
		return Promise.all(
			cards.map(async ({ id }) => ({ id, recipe: (await source.getRecipe(id)).recipe }))
		);
	}

	/** Sends the request, and keeps the version tag the server answers with for `id`. */
	async #send<T>(path: string, init: RequestInit, id?: string): Promise<T> {
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
				response.status === 412 && !new Headers(init.headers).has('If-None-Match')
					? CHANGED_SERVER_MESSAGE
					: (body.message ?? `The server refused the request (${response.status}).`),
				body.error ?? 'failed',
				body.results
			);
		}
		const tag = response.headers.get('ETag');
		if (id && tag) this.#tags.set(id, tag);
		return body as T;
	}

	async createSection(path: string, section: Section): Promise<void> {
		try {
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
		} catch (error) {
			// A section written by an earlier attempt whose recipe then failed to save.
			if (!(error instanceof WriteError && error.code === 'exists')) throw error;
		}
	}

	async uploadImage(id: string, file: Blob): Promise<{ src: string }> {
		const earlier = written.get(file);
		if (earlier?.id === id) return { src: earlier.src };
		const form = new FormData();
		form.append('file', file, 'photo');
		const { src } = await this.#send<{ src: string }>(`/images/${id}`, {
			method: 'POST',
			body: form
		});
		written.set(file, { id, src });
		return { src };
	}

	async save(id: string, recipe: Recipe, extras: { isNew: boolean }): Promise<SaveResult> {
		const tag = this.#tags.get(id);
		await this.#send(
			`/recipes/${id}`,
			{
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(extras.isNew ? { 'If-None-Match': '*' } : tag ? { 'If-Match': tag } : {})
				},
				body: JSON.stringify(recipe)
			},
			id
		);
		return { id };
	}

	async move(
		from: string,
		to: string,
		recipe: Recipe,
		extras: { photo?: Blob }
	): Promise<SaveResult> {
		const tag = this.#tags.get(from);
		if (!tag) {
			throw new WriteError(
				'The recipe has to be opened before it can be moved. Reload the page and try again.',
				'failed'
			);
		}
		await this.#send(
			`/recipes/${from}/move`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'If-Match': tag },
				body: JSON.stringify({ to })
			},
			to
		);
		this.#tags.delete(from);
		try {
			let edited = recipe;
			if (extras.photo) {
				const { src } = await this.uploadImage(to, extras.photo);
				edited = { ...recipe, image: { src, alt: recipe.image?.alt ?? '' } };
			}
			return await this.save(to, edited, { isNew: false });
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'The server refused the change.';
			throw new WriteError(
				`The recipe was moved to ${to}, but your other edits were not saved: ${reason} Open it at its new address and make them again.`,
				error instanceof WriteError ? error.code : 'failed',
				error instanceof WriteError ? error.results : []
			);
		}
	}

	async remove(id: string): Promise<SaveResult> {
		const tag = this.#tags.get(id);
		await this.#send(
			`/recipes/${id}`,
			{ method: 'DELETE', ...(tag ? { headers: { 'If-Match': tag } } : {}) },
			id
		);
		this.#tags.delete(id);
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
