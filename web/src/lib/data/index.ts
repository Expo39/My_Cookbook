import { adminRepo } from '$lib/admin/config';
import { ApiSource } from './api-source';
import { ApiWriter } from './api-writer';
import { GitHubWriter } from './github-writer';
import type { RecipeWriter } from './writer';
import type { RecipeSource } from './source';
import { StaticSource } from './static-source';

export { RecipeNotFoundError, type RecipeSource } from './source';

export function createSource(fetcher?: typeof fetch, backend: string = __BACKEND__): RecipeSource {
	switch (backend) {
		case 'static':
			return new StaticSource(fetcher);
		case 'api':
		case 'server':
			return new ApiSource(fetcher);
		default:
			throw new Error(`Unknown PUBLIC_BACKEND "${backend}".`);
	}
}

/** A writer for the build's backend: GitHub commits for `static`, the server's API otherwise. */
export function createWriter(
	token: string | null,
	backend: string = __BACKEND__,
	fetcher?: typeof fetch
): RecipeWriter {
	if (backend === 'api' || backend === 'server') return new ApiWriter(fetcher);
	if (!token) throw new Error('Editing is locked.');
	return new GitHubWriter(token, adminRepo, fetcher);
}
