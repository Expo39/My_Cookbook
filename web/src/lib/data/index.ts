import { ApiSource } from './api-source';
import type { RecipeSource } from './source';
import { StaticSource } from './static-source';

export { RecipeNotFoundError, type RecipeSource } from './source';

export function createSource(fetcher?: typeof fetch, backend: string = __BACKEND__): RecipeSource {
	switch (backend) {
		case 'static':
			return new StaticSource(fetcher);
		case 'api':
			return new ApiSource();
		default:
			throw new Error(`Unknown PUBLIC_BACKEND "${backend}".`);
	}
}
