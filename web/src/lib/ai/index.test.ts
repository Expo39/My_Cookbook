import { describe, expect, it } from 'vitest';
import { createAiClient, ServerClient, WorkerClient } from '.';

describe('createAiClient', () => {
	it('is null when the static build has no endpoint', () => {
		expect(createAiClient('static', '')).toBeNull();
	});

	it('uses the Worker when an endpoint is set', () => {
		expect(createAiClient('static', 'https://ai.example.test')).toBeInstanceOf(WorkerClient);
	});

	it('uses the server on the self-hosted backend, whatever the endpoint', () => {
		expect(createAiClient('api', '')).toBeInstanceOf(ServerClient);
		expect(createAiClient('api', 'https://ai.example.test')).toBeInstanceOf(ServerClient);
	});
});
