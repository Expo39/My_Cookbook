import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptSecrets } from './crypto';
import { admin } from './session.svelte';

const password = 'a long enough password';

afterEach(() => {
	admin.lock();
	vi.restoreAllMocks();
	sessionStorage.clear();
});

describe('the editing session', () => {
	it('brings the import secret back after a reload', async () => {
		const blob = await encryptSecrets({ token: 'tok', aiImportSecret: 'import' }, password, 1000);
		vi.spyOn(admin, 'fetchBlob').mockResolvedValue(blob);
		await admin.unlock(password);

		admin.token = null;
		admin.aiImportSecret = null;
		admin.unlocked = false;
		await admin.restore();

		expect(admin.token).toBe('tok');
		expect(admin.aiImportSecret).toBe('import');
	});

	it('forgets both secrets on lock', async () => {
		const blob = await encryptSecrets({ token: 'tok', aiImportSecret: 'import' }, password, 1000);
		vi.spyOn(admin, 'fetchBlob').mockResolvedValue(blob);
		await admin.unlock(password);
		admin.lock();

		expect(sessionStorage.length).toBe(0);
		await admin.restore();
		expect(admin.unlocked).toBe(false);
		expect(admin.aiImportSecret).toBeNull();
	});
});
