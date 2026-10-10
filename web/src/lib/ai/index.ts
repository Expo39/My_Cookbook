import { base } from '$app/paths';
import type { AiClient } from './client';
import { ServerClient } from './server-client';
import { WorkerClient } from './worker-client';

export * from './client';
export { adminProof } from './proof';
export { ServerClient, WorkerClient };

/**
 * The client for this build, or `null` when the sous-chef is not set up. The self-hosted backend serves it
 * itself; otherwise `PUBLIC_AI_ENDPOINT` (or `ai.endpoint` in cookbook.config.json) names the Worker.
 */
export function createAiClient(
	backend: string = __BACKEND__,
	endpoint: string = __AI_ENDPOINT__,
	fetcher?: typeof fetch
): AiClient | null {
	if (backend === 'api') return new ServerClient(base, fetcher);
	return endpoint ? new WorkerClient(endpoint, fetcher) : null;
}
